const router= require("express").Router();
const XLSX = require("xlsx");
const _ = require("lodash");
const mongodb = require("mongodb");
let logger = global.logger;
const addFileToGridFS = require("./fileMapperMiddleware").addFileToGridFS;
const removeFiles = require("./fileMapperMiddleware").removeFiles;
const getSheetDataFromGridFS = require("./fileMapperMiddleware").getSheetDataFromGridFS;
const getColumns = require("./fileMapperMiddleware").getColumns;
const FileType = require("file-type");
let levenshtein = require("fast-levenshtein");

router.post("/api/a/rbac/:app/user/utils/bulkCreate/upload",function(_req, _res){
	let extensionType = ["ods", "xlsx"];
	logger.debug("File upload hander :: upload()");
	logger.debug(`File metadata :: ${JSON.stringify(_req.file)}`);
	if (!_req.file) return _res.status(400).send("No files were uploaded.");
	let fileId = `tmp-${Date.now()}`;
	_req.file.fileId = fileId;
	logger.debug(`File id of ${_req.file.originalname} :: ${_req.file.fileId}`);
	let fileExtn = _req.file.originalname.split(".").pop();
	let collectionName = "userMgmt.users";
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
		.then(() => addFileToGridFS(_req.file, global.mongoConnectionAuthor, collectionName))
		.then(() => {
			let data = {
				_id: fileId,
				fileId: fileId,
				status: "Uploaded",
				type: "import",
				fileName: _req.file.originalname,
				_metadata: {
					lastUpdated: new Date(),
					createdAt: new Date(),
					deleted: false
				}
			};
			return global.mongoConnectionAuthor.collection(`${collectionName}.fileTransfers`).insertOne(data);
		})
		.then(
			_d => logger.trace(_d.result),
			_e => {
				logger.error(_e.message);
				removeFiles(_req.file.path);
				_res.status(500).json({
					"message": _e.message
				});
			}
		)
		.catch(_e => {
			logger.error(_e);
			_res.status(400).json({
				"message": _e
			});
		});
});
router.put("/api/a/rbac/:app/user/utils/bulkCreate/:fileId/sheetSelect",function(_req, _res) {
	logger.debug(`Sheet select : ${JSON.stringify(_req.body)}`);
	let fileName = _req.body.fileId;
	logger.debug(`fileName :: ${fileName}`);
	let sheetId = _req.body.sheet;
	let type = _req.body.type;
	let isHeaderProvided = _req.body.fileHeaders;
	let topDelete = _req.body.topSkip;
	let bottomDelete = _req.body.bottomSkip ? _req.body.bottomSkip - 1 : undefined;
	let userKeys = _req.body.userKeys;
	logger.debug("Read File");
	let collectionName = "userMgmt.users";
	logger.debug(`GridFS DB.col :: ${global.mongoConnectionAuthor}.${collectionName}`);
	let csv;
	getSheetDataFromGridFS(fileName, global.mongoConnectionAuthor, collectionName)
		.then((bufferData) => {
			let wb = XLSX.read(bufferData, {
				type: "buffer",
				cellDates: true,
				raw: true,
				dateNF: "YYYY-MM-DD HH:MM:SS"
			});
			logger.debug("File read completed");
			sheetId = type === "csv" ? wb.SheetNames[0] : sheetId;
			let ws = wb.Sheets[sheetId];
			var range = XLSX.utils.decode_range(ws["!ref"]);
			logger.debug("Calculated range");
			var sc = range.s.c;
			let originalFileId = fileName;
			fileName = fileName + "-" + _.camelCase(sheetId);
			if (topDelete != undefined) {
				sc = range.s.c + topDelete;
			}
			var ec = range.e.c;
			logger.debug("bottomDelete", bottomDelete);
			if (bottomDelete != undefined) {
				var er = range.e.r - bottomDelete;
				logger.debug("File read started");
				wb = XLSX.read(bufferData, {
					sheetRows: er,
					type: "buffer",
					cellDates: true,
					cellNF: false,
					cellText: true,
					dateNF: "YYYY-MM-DD HH:MM:SS"
				});
				logger.debug("File read completed");
				sheetId = type === "csv" ? wb.SheetNames[0] : sheetId;
				ws = wb.Sheets[sheetId];
			}
			try {
				logger.debug("Converting sheet to json");
				let parsedData = XLSX.utils.sheet_to_json(ws, {
					header: 1,
					blankrows: false,
					range: sc,
					ec,
					dateNF: "YYYY-MM-DD HH:MM:SS"
				});
				logger.debug("Converted sheet to json");
				parsedData = parsedData.map(arr => arr.map(key => typeof key === "string" ? key.trim().replace(/[^ -~]/g, "") : key));
				let maxCol = 0;
				parsedData.forEach(arr => {
					if (arr.length > maxCol) maxCol = arr.length;
				});
				if (!isHeaderProvided)
					parsedData.splice(0, 0, getColumns(maxCol));
				logger.debug("Converting array to sheet");
				let newWs = XLSX.utils.aoa_to_sheet(parsedData);
				logger.debug("Converting sheet to csv");
				csv = XLSX.utils.sheet_to_csv(newWs);
				logger.debug("Converted sheet to csv");
				logger.debug("Calculating headers");
				if (parsedData && parsedData[0]) {
					let headers = null;
					let maxCol = 0,
						i = 0;
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
						if (userKeys && userKeys.length > 0) {
							userKeys.forEach(userK => {
								let min = 100000;
								let minKey = null;
								arr.forEach(_k => {
									if (_k && _k.name) {
										let score = levenshtein.get(_.camelCase(userK.toLowerCase()), _.camelCase(_k.name.toLowerCase()));
										if (score < min) {
											min = score;
											minKey = _k.name;
										}
									}
								});
								headers.mapping[userK] = minKey;
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
					logger.debug(JSON.stringify({
						collectionName,
						fileName
					}));
					global.mongoConnectionAuthor.collection(`${collectionName}.fileTransfers`).updateOne({
						_id: originalFileId
					}, {
						$set: {
							status: "SheetSelect",
							headers,
							fileId: fileName,
							"_metadata.lastUpdated": new Date()
						}
					}).then(_d => {
						logger.trace(_d.result);
					});
				} else {
					_res.status(400).json({
						message: "File is empty"
					});
				}
			} catch (err) {
				if (!_res.headersSent) {
					_res.status(500).json({
						message: err.message
					});
				}
			}
		})
		.then(() => {
			let dbGFS = global.mongoConnectionAuthor;
			let gfsBucket = new mongodb.GridFSBucket(dbGFS, {
				bucketName: `${collectionName}.fileImport`
			});
			let uploadStream = gfsBucket.openUploadStream(fileName, {
				contentType: "text/csv",
				metadata: {
					filename: fileName
				}
			});
			uploadStream.write(csv);
			uploadStream.end();
			uploadStream.on("error", error => {
				logger.error(error);
			});
			uploadStream.on("finish", () => logger.info("GRID upload Finished"));
		})
		.catch(err => {
			_res.status(500).json({
				message: err.message
			});
			logger.error(err);
		});
});

module.exports = router;