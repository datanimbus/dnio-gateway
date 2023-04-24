const XLSX = require("xlsx");
const fs = require("fs");
// const request = require("request");
// const authUtil = require("./authUtil");
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
	if (_db == global.mongoConnectionAuthor) {
		dbGFS = global.mongoConnectionAuthor;
	} else {
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

async function upload(_req, _res) {
	let extensionType = ["ods", "xlsx"];
	logger.debug("File upload hander :: upload()", _req.path);
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

	let dsDetails = await global.mongoConnectionAuthor.collection("services").findOne({ app: urlSplit[3], api: `/${urlSplit[4]}` });

	logger.trace("Data Service Details - ", dsDetails);

	FileType.fromFile(_req.file.path)
		.then(_fileExtn => {
			if (_fileExtn) {
				logger.debug(`FileType : ${JSON.stringify(_fileExtn)}`);
				if (_fileExtn.ext == "msi" && fileExtn == "xls") return "excel";
				if (_fileExtn.ext == "cfb" && fileExtn == "xls") return "excel";
				if (extensionType.indexOf(_fileExtn.ext) != -1) return "excel";
			}
			logger.debug(`FileType : ${_fileExtn}`);
			logger.info(dsDetails.schemaFree && !_fileExtn && fileExtn == "json");
			if (!_fileExtn && fileExtn == "csv") return "csv";
			if (dsDetails.schemaFree && !_fileExtn && fileExtn == "json") return "json";
			throw { message: "Unsupported FileType" };
		})
		.then(_d => {
			let responsePayload = {
				type: fileExtn,
				fileId: _req.file.fileId,
				fileName: _req.file.originalname
			};
			if (_d === "json") {
				let bufferData = fs.readFileSync(_req.file.path);
				if (bufferData && bufferData.length > 0) JSON.parse(bufferData.toString());
			}

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
	if (_db == global.mongoConnectionAuthor) {
		dbGFS = global.mongoConnectionAuthor;
	} else {
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
			if (!Object.entries(ws) || _.isEmpty(Object.entries(ws))) {
				_res.status(400).json({
					message: "File is empty"
				});
				return Promise.reject(new Error("File is empty"));
			}
			if (Object.entries(ws).length > 0 && ws["!ref"]) {
				var range = XLSX.utils.decode_range(ws["!ref"]);
			} else {
				_res.status(400).json({
					message: "File is empty"
				});
				return Promise.reject(new Error("File is empty"));
			}

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
				if (parsedData.length == 0 || (isHeaderProvided && parsedData.length == 1)) {
					_res.status(400).json({
						message: "File is empty"
					});
					return Promise.reject(new Error("File is empty"));
				}
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

let e = {};

function mapJson(req, res) {
	let txnId = req.get("TxnId") || req.headers.TxnId;
	let fileName = req.path.split("/")[7];
	logger.info(`[${txnId}] Mapping JSON Data from file ${fileName}`);

	let jsonRecords = [];
	let urlSplit = req.path.split("/");
	let db = `${config.odpNS}-${urlSplit[3]}`;
	let collectionName = urlSplit[4];
	logger.debug(`[${txnId}] GridFS DB collection name :: ${db}.${collectionName}`);

	getSheetDataFromGridFS(fileName, db, collectionName)
		.then((bufferData) => {
			try {
				jsonRecords = bufferData;
				logger.trace(`[${txnId}] Buffer Data - ${bufferData}`);

				// let parsedData = JSON.parse(jsonRecords);
				// logger.trace(`[${txnId}] JSON Records - ${JSON.stringify(parsedData)}`);

				if (jsonRecords && jsonRecords[0]) {
					let headers = null;
					let originalFileId = fileName;
					fileName += "-1";

					logger.debug(`[${txnId}] Sending response`);
					res.json({
						fileId: fileName,
						fileName: req.body.fileName
					});
					logger.debug(`[${txnId}] ${JSON.stringify({ db, collectionName, fileName })}`);

					global.appcenterDbo.db(db).collection(`${collectionName}.fileTransfers`).updateOne({ _id: originalFileId }, { $set: { status: "SheetSelect", headers, fileId: fileName, "_metadata.lastUpdated": new Date() } }).then(_d => logger.trace(_d.result));
				} else {
					res.status(400).json({
						message: "File is empty"
					});
					return Promise.reject(new Error("File is empty"));
				}
			} catch (err) {
				if (!res.headersSent) {
					res.status(500).json({
						message: err.message
					});
					return Promise.reject(err.message);
				}
			}
		})
		.then(() => {
			let dbGFS = global.appcenterDbo.db(db);
			let gfsBucket = new mongodb.GridFSBucket(dbGFS, { bucketName: `${collectionName}.fileImport` });
			let uploadStream = gfsBucket.openUploadStream(fileName, {
				contentType: "application/json",
				metadata: {
					filename: fileName
				}
			});
			uploadStream.write(jsonRecords);
			uploadStream.end();
			uploadStream.on("error", error => { logger.error(error); });
			uploadStream.on("finish", () => logger.info("GRID upload Finished"));
		})
		.catch(err => {
			if (!res.headersSent) {
				res.status(500).json({
					message: err.message
				});
			}
			logger.error(`[${txnId}] Error mapping JSON - ${err}`);
		});
}

e.fileMapperHandler = async (req, res, next) => {
	let txnId = req.get("TxnId") || req.headers.TxnId;
	let urlSplit = req.path.split("/");
	if (urlSplit[6] && urlSplit[6] === "fileMapper") {

		if (urlSplit[3] && !urlSplit[3].match(/^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]+$/)) {
			return next(new Error('App name must consist of alphanumeric characters or \'-\' , and must start and end with an alphanumeric character.'));
		}
		
		if (urlSplit[7] === "upload") {
			logger.debug(`[${txnId}] Filemapper :: Upload`);
			return await upload(req, res);
		}
		if (req.method === "PUT" && !urlSplit[8]) {
			logger.debug(`[${txnId}] Filemapper :: Sheet selection`);
			if (req.body.type === "json") {
				return mapJson(req, res);
			} else {
				return sheetSelect(req, res);
			}
		}
		next();
	} else {
		next();
	}
};

module.exports = e;
module.exports.addFileToGridFS = addFileToGridFS;
module.exports.removeFiles = removeFiles;
module.exports.getSheetDataFromGridFS = getSheetDataFromGridFS;
module.exports.getColumns = getColumns;
