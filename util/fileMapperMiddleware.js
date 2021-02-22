const XLSX = require("xlsx");
const fs = require("fs");
const request = require("request");
const authUtil = require("./authUtil");
const _ = require("lodash");
const mongodb = require("mongodb");
const isDev = process.env.DEV;
let logger = global.logger;
const config = require("../config/config");
const FileType = require("file-type");
let levenshtein = require("fast-levenshtein");
var dbGFS;

const gwUtil = require("./gwUtil");

function removeFiles(dir) {
	if (!isDev) {
		if (fs.existsSync(dir))
			fs.unlinkSync(dir);
		let fileArr = dir.split("-");
		fileArr.pop();
		let file2 = fileArr.join("-");
		if (fs.existsSync(file2))
			fs.unlinkSync(file2);
	}
}

function addFileToGridFS(_file, _db, _collectionName) {
	if(_db == global.mongoConnectionAuthor){
		dbGFS = global.mongoConnectionAuthor;
	}else{
		dbGFS = global.appcenterDbo.db(_db);
	}
	let gfsBucket = new mongodb.GridFSBucket(dbGFS, { bucketName: `${_collectionName}.fileImport` });
	return new Promise((resolve, reject) => {
		fs.createReadStream(_file.path).
			pipe(gfsBucket.openUploadStream(_file.fileId, {
				contentType: _file.mimetype,
				metadata: {
					filename: _file.fileId
				}
			}))
			.on("error", function (error) {
				logger.error(error);
				reject(error);
			})
			.on("finish", function (file) {
				logger.debug(`File Uploaded to db: ${_db} , collection: ${_collectionName}.fileImport`);
				resolve(file);
			});
	});
}

function upload(_req, _res) {
	let extensionType = ["ods", "xlsx"];
	logger.debug("File upload hander :: upload()");
	logger.debug(`File metadata :: ${JSON.stringify(_req.file)}`);
	if (!_req.file) return _res.status(400).send("No files were uploaded.");
	let fileId = `tmp-${Date.now()}`;
	_req.file.fileId = fileId;
	logger.debug(`File id of ${_req.file.originalname} :: ${_req.file.fileId}`);

	let fileExtn = _req.file.originalname.split(".").pop();
	let urlSplit = _req.path.split("/");
	let db = `${config.odpNS}-${urlSplit[3]}`;
	let collectionName = urlSplit[4];
	logger.debug(`GridFS DB.col :: ${db}.${collectionName}`);

	FileType.fromFile(_req.file.path)
		.then(_fileExtn => {
			if (_fileExtn) {
				logger.debug(`FileType : ${JSON.stringify(_fileExtn)}`);
				if (_fileExtn.ext == "msi" && fileExtn == "xls") return "excel";
				if (extensionType.indexOf(_fileExtn.ext) != -1) return "excel";
			}
			logger.debug(`FileType : ${_fileExtn}`);
			if (!_fileExtn && fileExtn == "csv") return "csv";
			throw "Unsupported FileType";
		})
		.then(_d => {
			let responsePayload = {
				type: fileExtn,
				fileId: _req.file.fileId,
				fileName: _req.file.originalname
			};
			if (_d == "excel") responsePayload.sheets = XLSX.readFile(_req.file.path).SheetNames;
			_res.json(responsePayload);
		})
		.then(() => addFileToGridFS(_req.file, db, collectionName))
		.then(() => {
			let data = {
				_id: fileId,
				fileId: fileId,
				status: "Uploaded",
				type: "import",
				user: _req.user._id,
				fileName: _req.file.originalname,
				_metadata: { lastUpdated: new Date(), createdAt: new Date(), deleted: false }
			};
			return global.appcenterDbo.db(db).collection(`${collectionName}.fileTransfers`).insertOne(data);
		})
		.then(
			_d => logger.trace(_d.result),
			_e => {
				logger.error(_e.message);
				removeFiles(_req.file.path);
				_res.status(500).json({ "message": _e.message });
			}
		)
		.catch(_e => {
			logger.error(_e);
			_res.status(400).json({ "message": _e });
		});
}

function getColumnName(number) {
	if (number === 1) return "A";
	let digits = Math.ceil(Math.log(number) / Math.log(26));
	let column = "";
	while (digits) {
		let b = Math.floor(number / Math.pow(26, digits - 1));
		column += String.fromCharCode(64 + b);
		digits--;
		number = number % (26 * b);
	}
	return column;
}

function getColumns(count) {
	let columns = [];
	let i = 1;
	while (i <= count) {
		columns.push(getColumnName(i));
		i++;
	}
	return columns;
}

function getSheetDataFromGridFS(fileName, _db, collection) {
	if(_db == global.mongoConnectionAuthor){
		dbGFS = global.mongoConnectionAuthor;
	}else{
		dbGFS = global.appcenterDbo.db(_db);
	}
	let gfsBucket = new mongodb.GridFSBucket(dbGFS, { bucketName: `${collection}.fileImport` });
	return new Promise((resolve, reject) => {
		gfsBucket.find({ filename: fileName }).toArray(function (err, file) {
			if (err) {
				logger.error(err);
				reject(err);
			}
			if (file[0]) {
				let readstream = gfsBucket.openDownloadStream(file[0]._id);
				readstream.on("error", function (err) {
					logger.error(err);
					reject(err);
				});
				var bufs = [];
				readstream.on("data", function (d) { bufs.push(d); });
				readstream.on("end", function () {
					var buf = Buffer.concat(bufs);
					resolve(buf);
				});
			} else {
				reject(new Error("Issue in getting data from GridFS "));
			}
		});
	});
}

function sheetSelect(_req, _res) {
	logger.debug(`Sheet select : ${JSON.stringify(_req.body)}`);
	let fileName = _req.path.split("/")[7];
	logger.debug(`fileName :: ${fileName}`);
	let sheetId = _req.body.sheet;
	let type = _req.body.type;
	let isHeaderProvided = _req.body.headers;
	let topDelete = _req.body.topSkip;
	let bottomDelete = _req.body.bottomSkip ? _req.body.bottomSkip - 1 : undefined;
	let dsKeys = _req.body.dsKeys;
	logger.debug("Read File");
	let urlSplit = _req.path.split("/");
	let db = `${config.odpNS}-${urlSplit[3]}`;
	let collectionName = urlSplit[4];
	logger.debug(`GridFS DB.col :: ${db}.${collectionName}`);
	let csv;

	getSheetDataFromGridFS(fileName, db, collectionName)
		.then((bufferData) => {
			let wb = XLSX.read(bufferData, { type: "buffer", cellDates: true, raw: true, dateNF: "YYYY-MM-DD HH:MM:SS" });
			logger.debug("File read completed");
			sheetId = type === "csv" ? wb.SheetNames[0] : sheetId;
			let ws = wb.Sheets[sheetId];
			var range = XLSX.utils.decode_range(ws["!ref"]);
			logger.debug("Calculated range");
			var sc = range.s.c;
			let originalFileId = fileName;
			fileName = fileName + "-" + _.camelCase(sheetId);
			//newDir = './uploads/' + fileName;
			if (topDelete != undefined) {
				sc = range.s.c + topDelete;
			}
			var ec = range.e.c;
			logger.debug("bottomDelete", bottomDelete);
			if (bottomDelete != undefined) {
				var er = range.e.r - bottomDelete;
				//wb = XLSX.readFile(dir, { sheetRows: er });
				logger.debug("File read started");
				wb = XLSX.read(bufferData, { sheetRows: er, type: "buffer", cellDates: true, cellNF: false, cellText: true, dateNF: "YYYY-MM-DD HH:MM:SS" });
				logger.debug("File read completed");
				sheetId = type === "csv" ? wb.SheetNames[0] : sheetId;
				ws = wb.Sheets[sheetId];
			}
			try {
				logger.debug("Converting sheet to json");
				let parsedData = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, range: sc, ec, dateNF: "YYYY-MM-DD HH:MM:SS" });
				logger.debug("Converted sheet to json");
				parsedData = parsedData.map(arr => arr.map(key => typeof key === "string" ? key.trim().replace(/[^ -~]/g, "") : key));
				let maxCol = 0;
				parsedData.forEach(arr => {
					if (arr.length > maxCol) maxCol = arr.length;
				});

				if (!isHeaderProvided)
					parsedData.splice(0, 0, getColumns(maxCol));

				logger.debug("Converting array to sheet");
				if (isHeaderProvided && gwUtil.hasDuplicate(parsedData[0])) {
					var duplicateColumns = gwUtil.getDuplicateValues(parsedData[0]);
					throw new Error(`There ${duplicateColumns.length > 1 ? "are" : "is a"} duplicate column/s '${duplicateColumns.join()}' present in the file. Please fix the same and try again.`);
				}
				let newWs = XLSX.utils.aoa_to_sheet(parsedData);
				logger.debug("Converting sheet to csv");
				csv = XLSX.utils.sheet_to_csv(newWs);
				logger.debug("Converted sheet to csv");

				logger.debug("Calculating headers");
				if (parsedData && parsedData[0]) {
					let headers = null;
					let maxCol = 0, i = 0;
					parsedData.forEach(arr => {
						if (arr.length > maxCol) maxCol = arr.length;
					});
					let arr = [];
					let columnArr = getColumns(maxCol);
					if (isHeaderProvided) {
						for (i = 0; i < maxCol; i++) {
							let buildJSON = {};
							buildJSON["name"] = parsedData[0][i];
							buildJSON["position"] = columnArr.slice(i, i + 1).toString();
							arr.push(buildJSON);
						}
						headers = {
							fileKeys: arr,
							mapping: {}
						};
						if (dsKeys && dsKeys.length > 0) {
							dsKeys.forEach(dsK => {
								let min = 100000;
								let minKey = null;
								arr.forEach(_k => {
									if (_k && _k.name) {
										let score = levenshtein.get(_.camelCase(dsK.toLowerCase()), _.camelCase(_k.name.toLowerCase()));
										if (score < min) {
											min = score;
											minKey = _k.name;
										}
									}
								});
								headers.mapping[dsK] = minKey;
							});
						}
					} else {
						for (i = 0; i < maxCol; i++) {
							let buildJSON = {};
							buildJSON["name"] = columnArr.slice(i, i + 1).toString();
							buildJSON["position"] = columnArr.slice(i, i + 1).toString();
							arr.push(buildJSON);
						}
						headers = {
							fileKeys: arr
						};
					}
					logger.debug("Sending response");
					_res.json({
						fileId: fileName,
						fileName: _req.body.fileName,
						headers
					});
					logger.debug(JSON.stringify({ db, collectionName, fileName }));

					global.appcenterDbo.db(db).collection(`${collectionName}.fileTransfers`).updateOne({ _id: originalFileId }, { $set: { status: "SheetSelect", headers, fileId: fileName, "_metadata.lastUpdated": new Date() } }).then(_d => logger.trace(_d.result));
				} else {
					_res.status(400).json({
						message: "File is empty"
					});
					return Promise.reject(new Error("File is empty"));
				}
			} catch (err) {
				if (!_res.headersSent) {
					_res.status(500).json({
						message: err.message
					});
					return Promise.reject(err.message);
				}
				// removeFiles(dir);
			}
		})
		.then(() => {
			let dbGFS = global.appcenterDbo.db(db);
			let gfsBucket = new mongodb.GridFSBucket(dbGFS, { bucketName: `${collectionName}.fileImport` });
			let uploadStream = gfsBucket.openUploadStream(fileName, {
				contentType: "text/csv",
				metadata: {
					filename: fileName
				}
			});

			uploadStream.write(csv);
			uploadStream.end();
			uploadStream.on("error", error => { logger.error(error); });
			uploadStream.on("finish", () => logger.info("GRID upload Finished"));
		})
		.catch(err => {
			if (!_res.headersSent) {
				_res.status(500).json({
					message: err.message
				});
			}
			logger.error(err);
			//removeFiles(dir);
		});
}

function requestValidation(req, body, fileId, invalidSNo) {
	let txnId = req.headers["TxnId"];
	let api = req.path.split("/")[3] + "/" + req.path.split("/")[4];
	logger.debug(`[${txnId}] Request validation :: API :: ${api}`);
	let host = global.masterServiceRouter[api];
	logger.debug(`[${txnId}] Request validation :: Host :: ${host}`);
	let url = host + "/" + api + `/utils/fileMapper/${fileId}/mapping`;
	logger.debug(`[${txnId}] Request validation :: URL :: ${url}`);
	delete body.sheetData;
	body.invalidSNo = invalidSNo;
	let options = {
		url: url,
		method: "PUT",
		headers: {
			"TxnId": txnId,
			"Authorization": req.get("Authorization"),
			"User": req.user ? req.user._id : null
		},
		body,
		json: true
	};
	return new Promise((resolve, reject) => {
		request.put(options, function (err, res, body) {
			if (err) {
				logger.error(`[${txnId}] Request validation :: ${err.message}`);
				reject(err);
			} else if (!res) {
				logger.error(`[${txnId}] Request validation :: Service is down`);
				reject(new Error("Service is DOWN"));
			}
			else {
				if (res.statusCode >= 200 && res.statusCode < 400) {
					logger.trace(`[${txnId}] Request validation :: ${JSON.stringify(body)}`);
					resolve(body);
				} else {
					let message = res.body && res.body.message ? res.body.message : "Request failed";
					logger.error(`[${txnId}] Request validation :: ${message}`);
					reject(new Error(message));
				}
			}
		});
	});
}

function getStagedBulkCreateDocCount(app, api, filter, fileId, req) {
	let url = null;
	if (process.env.KUBERNETES_SERVICE_HOST && process.env.KUBERNETES_SERVICE_PORT) {
		url = "http://" + api.toLowerCase() + "." + config.odpNS + "-" + app.toLowerCase().replace(/ /g, "") + `/${app}/${api}/utils/filemapper/${fileId}/count`;
	} else {
		let host = global.masterServiceRouter[app + "/" + api];
		if (host) {
			url = host + `/${app}/${api}/utils/filemapper/${fileId}/count`;
		} else {
			return Promise.reject(new Error("AppCenter host not found"));
		}
	}
	let options = {
		url: url,
		method: "GET",
		headers: {
			"Content-Type": "application/json",
			"TxnId": req.get("txnId") ? req.get("txnId") : gwUtil.getTxnId(req),
			"Authorization": req.get("Authorization"),
			"User": req.get("user")
		},
		qs: {
			filter: JSON.stringify(filter)
		},
		json: true
	};
	return new Promise((resolve, reject) => {
		request.get(options, function (err, res, body) {
			if (err) {
				logger.error(`[${req.get("txnId")}] Error in getStagedBulkCreateDocCount :: `, err);
				reject(err);
			} else if (!res) {
				logger.error("Service DOWN");
				reject(new Error("Service DOWN"));
			}
			else {
				if (res.statusCode >= 200 && res.statusCode < 400) {
					resolve(body);
				} else {
					logger.error(`[${req.get("txnId")}] Error response in getStagedBulkCreateDocCount :: `, body);
					reject(new Error(res.body && res.body.message ? "Request failed:: " + res.body.message : "Request failed"));
				}
			}
		});
	});
}

function objectMapping(sheetJson, mapping) {
	let newDoc = {};
	if (!mapping) return;
	if (mapping && mapping.constructor == {}.constructor) {
		Object.keys(mapping).forEach(_k => {
			if (typeof mapping[_k] == "string") {
				newDoc[_k] = sheetJson[mapping[_k]];
			} else if (Array.isArray(mapping[_k])) {
				newDoc[_k] = mapping[_k].map(_o => {
					return objectMapping(sheetJson, _o);
				});
				newDoc[_k] = newDoc[_k].filter(_d => _d);
			} else {
				newDoc[_k] = objectMapping(sheetJson, mapping[_k]);
			}
		});
	} else if (typeof mapping == "string") {
		return sheetJson[mapping];
	}
	if (newDoc && Object.keys(JSON.parse(JSON.stringify(newDoc))).length > 0) {
		return newDoc;
	}
	return;
}

function substituteMappingSheetToSchema(sheetArr, headerMapping) {
	return sheetArr.map(obj => objectMapping(obj, headerMapping));
}

function validateData(_req, _res) {
	let txnId = _req.headers["TxnId"];
	let data = _req.body;
	logger.trace(`[${txnId}] Validate data :: ${JSON.stringify(data)}`);
	let flag = isFileMapperAllowed(_req._highestPermission);
	logger.debug(`[${txnId}] Validate data :: File mapper allowed? ${flag ? "YES" : "NO"}`);
	// let flag = checkPermission(authUtil.flattenPermission(_req._highestPermission, "", ["W"]), data.headerMapping);
	if (!flag) {
		_res.status(403).json({"message": "Not Permitted."});
		return;
	}
	let urlSplit = _req.path.split("/");
	logger.debug(`[${txnId}] Validate data :: URL split :: ${urlSplit}`);
	let fileName = urlSplit[7];
	logger.debug(`[${txnId}] Validate data :: Filename :: ${fileName}`);
	let db = `${config.odpNS}-${urlSplit[3]}`;
	logger.debug(`[${txnId}] Validate data :: DB :: ${db}`);
	let collectionName = urlSplit[4];
	logger.debug(`[${txnId}] Validate data :: Collection :: ${collectionName}`);
	let sNo = 1;

	if (_req.user.isSuperAdmin) {
		logger.debug(`[${txnId}] Validate data :: Is super admin? YES`);
		return requestValidation(_req, _req.body, data.fileId, JSON.stringify([]))
			.then((_d) => _res.json(_d))
			.catch(err => {
				logger.error(`[${txnId}] Validate data :: ${err.message}`);
				_res.status(500).json({message: err.message});
			});
	}
	logger.debug(`[${txnId}] Validate data :: Is super admin? NO`);
	return getSheetDataFromGridFS(fileName, db, collectionName)
		.then((bufferData) => {
			let wb = XLSX.read(bufferData, { type: "buffer", cellDates: true, cellNF: false, cellText: true, dateNF: "YYYY-MM-DD HH:MM:SS" });
			let ws = wb.Sheets[wb.SheetNames[0]];
			let reqBody = {
				headerMapping: data.headerMapping,
				headers: data.headers,
				fileId: fileName,
				fileName: data.fileName
			};
			let sheetData = XLSX.utils.sheet_to_json(ws, { blankrows: false, dateNF: "YYYY-MM-DD HH:MM:SS" });
			let newSheetData = substituteMappingSheetToSchema(sheetData, data.headerMapping).map(_d => {
				let newData = JSON.parse(JSON.stringify(_d));
				newData.__sNo = ++sNo;
				return newData;
			});
			return authUtil.checkRecordPermissionForUserCRUD(_req.userPermissionIds, _req.entityPermission, "POST", "filemapper", newSheetData, _req)
				.then((validSNo) => {
					let invalidsNo = [];
					if (validSNo) {
						validSNo.sort();
						for (let i = 2, j = 0; i <= newSheetData.length + 1; i++) {
							if (validSNo[j] == i) j++;
							else invalidsNo.push(i);
						}
					}
					if (invalidsNo.length > 100) throw new Error("Insufficient user privilege");
					return requestValidation(_req, reqBody, data.fileId, JSON.stringify(invalidsNo));
				})
				.then((_d) => _res.json(_d))
				.catch(err => {
					_res.status(500).json({
						message: err.message
					});
					logger.error(err);
				});
		});
}

function requestBulkCreate(req, body, filename) {
	let api = req.path.split("/")[3] + "/" + req.path.split("/")[4];
	let host = global.masterServiceRouter[api];
	let url = host + "/" + api + `/utils/fileMapper/${filename}/create`;
	// let url = config.get("wf") + "/workflow/fileMapper/create";
	// let sheetData = body.sheetData;
	delete body.sheetData;
	let options = {
		url: url,
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"TxnId": req.get("txnId") ? req.get("txnId") : gwUtil.getTxnId(req),
			"Authorization": req.get("Authorization"),
			"User": req.user ? req.user._id : null
		},
		
		// qs: {
		// 	path: "/" + api + `/fileMapper/${filename}/create`,
		// 	serviceId: serviceInfo.serviceId,
		// 	app: serviceInfo.app
		// },
		body: body,
		json: true
	};

	return new Promise((resolve, reject) => {
		request.post(options, function (err, res, body) {
			if (err) {
				logger.error(`[${req.get("txnid")}] Error in requestBulkCreate :: `, err);
				reject(err);
			} else if (!res) logger.error("Service is DOWN");
			else {
				if (res.statusCode >= 200 && res.statusCode < 400) {
					resolve(body);
				} else {
					logger.error(`[${req.get("txnid")}] Error response in requestBulkCreate :: `, body);
					reject(new Error(res.body && res.body.message ? "Request failed:: " + res.body.message : "Request failed bulk create"));
				}
			}
		});
	});
}

function isOperationAllowed(highestPermission, createCount, updateCount) {
	let methodAllowed = highestPermission ? highestPermission.map(_o => _o.method) : [];
	if (methodAllowed.indexOf("PUT") === -1 && updateCount > 0) {
		return false;
	}
	if (methodAllowed.indexOf("POST") === -1 && createCount > 0) {
		return false;
	}
	return true;
}

function bulkCreate(_req, _res) {
	let txnId = _req.get('txnId');
	let data = _req.body;
	let flag = isFileMapperAllowed(_req._highestPermission);
	// let flag = checkPermission(authUtil.flattenPermission(_req._highestPermission, "", ["W"]), data.headerMapping);
	if (!flag) {
		_res.status(403).json({
			"message": "Not Permitted."
		});
		return;
	}
	let fileId = _req.path.split("/")[7];
	let reqBody = {
		update: data.update,
		fileId: data.fileId,
		create: data.create,
		path: _req.path,
		fileName: data.fileName
	};
	let api = _req.path.split("/")[4];
	let app = _req.path.split("/")[3];
	return getStagedBulkCreateDocCount(app, api, { fileId, $or: [{ status: "Validated" }, { sNo: { $in: data.create } }] }, fileId, _req)
		.then(_count => {
			let flag2 = isOperationAllowed(_req._highestPermission, _count, data.update.length);
			if (!flag2) {
				_res.status(403).json({
					"message": "Not Permitted."
				});
				throw new Error("Not Permitted.");
			}
			return requestBulkCreate(_req, reqBody, fileId);
		})
		.then((_d) => {
			_res.json(_d);
			// removeFiles(dir);
		})
		.catch(err => {
			logger.error(`[${txnId} :: Error in bulkCreate :: `, err);
			if(!_res.headersSent) {
				_res.status(500).json({
					message: err.message
				});
			}
		});
}

function isFileMapperAllowed(highestPermission) {
	if (highestPermission) {
		let allowedMethod = highestPermission.map(_o => _o.method);
		return allowedMethod.indexOf("PUT") > -1 || allowedMethod.indexOf("POST") > -1;
	} else {
		return false;
	}
}

let e = {};

// function getServiceInfo(app, api) {
// 	return new Promise((resolve, reject) => {
// 		request(config.get("sm") + "/sm/service", {
// 			headers: {
// 				"content-type": "application/json"
// 			},
// 			qs: {
// 				"select": "_id,app",
// 				"filter": {
// 					"app": app,
// 					"api": api
// 				}
// 			},
// 			json: true
// 		}, (smErr, smRes, body) => {
// 			if (smErr) {
// 				reject(smErr);
// 			}
// 			if (smRes.statusCode < 200 && smRes.statusCode > 400) {
// 				reject(new Error("SM returned status " + smRes.statusCode));
// 			} else {
// 				if (!body || body.length === 0) {
// 					throw new Error("No service found");
// 				}
// 				return resolve({
// 					"serviceId": body[0]._id,
// 					"app": body[0].app
// 				});
// 			}
// 		});
// 	});
// }

e.fileMapperHandler = (req, res, next) => {
	let txnId = req.get("TxnId") || req.headers.TxnId;
	let urlSplit = req.path.split("/");
	if (urlSplit[6] && urlSplit[6] === "fileMapper") {
		if (urlSplit[7] === "upload") {
			logger.debug(`[${txnId}] Filemapper :: Upload`);
			return upload(req, res);
		}
		if (req.method === "PUT" && urlSplit[8] == "mapping") {
			logger.debug(`[${txnId}] Filemapper :: Mapping`);
			return validateData(req, res);
		}
		if (req.method === "PUT" && !urlSplit[8]) {
			logger.debug(`[${txnId}] Filemapper :: Sheet selection`);
			return sheetSelect(req, res);
		}
		if (req.method === "POST") {
			logger.debug(`[${txnId}] Filemapper :: Bulk create`);
			return bulkCreate(req, res);
		}
		if (req.method === "PUT" && urlSplit[8] == "readStatus") {
			logger.debug(`[${txnId}] Filemapper :: Read status`);
			return next();
		}
		if (req.method === "GET") {
			if (authUtil.compareUrl("/api/c/{app}/{api}/utils/fileMapper/{fileId}", req.path) || authUtil.compareUrl("/api/c/{app}/{api}/utils/fileMapper/{fileId}/count", req.path))
				return next();
		}
		next("Unknown API for fileMapper");
	} else {
		next();
	}
};

module.exports = e;
module.exports.addFileToGridFS = addFileToGridFS;
module.exports.removeFiles = removeFiles;
module.exports.getSheetDataFromGridFS = getSheetDataFromGridFS;
module.exports.getColumns = getColumns;