let e = {};
const _ = require("lodash");
const config = require("../config/config");
const request = require("request");
const uuid = require("uuid/v1");
const gwUtil = require("./gwUtil");
const cacheUtil = require("./cacheUtil");

let logger = global.logger;


e.addSelect = function (txnId, arr, select) {
	logger.trace(`[${txnId}] e.addSelect: arr : ${JSON.stringify(arr)}`);
	logger.trace(`[${txnId}] e.addSelect: select : ${JSON.stringify(select)}`);
	let selectArr = select;
	// Next 2 line: Added by Jerry
	// Date: 3rd Mar 2020
	// The following lines added to take care client-side HTTP Parameter Pollution(HPP)
	// Express.js handles it, we had to handle it in the code
	if (typeof selectArr == "string") selectArr = selectArr.split(",");
	if (typeof selectArr == "object") selectArr = selectArr.join(",").split(",");
	logger.trace(`[${txnId}] e.addSelect: selectArr : ${JSON.stringify(selectArr)}`);
	if (!selectArr.some(_s => _s.startsWith("-"))) {
		selectArr = selectArr.concat(arr);
	}
	return selectArr.join(",");
};

function throwError(msg, statusCode) {
	let err = new Error(msg);
	err.statusCode = statusCode;
	throw err;
}

e.groupRolesPermArr = ["PMGADS", "PVGADS", "PNGADS", "PMGAL", "PVGAL", "PNGAL", "PMGADF", "PVGADF", "PNGADF", "PMGAP", "PVGAP", "PNGAP", "PMGANS", "PVGANS", "PNGANS", "PMGAA", "PVGAA", "PNGAA", "PMGAU", "PVGAU", "PNGAU", "PMGAB", "PVGAB", "PNGAB", "PMGABM", "PVGABM", "PNGABM", "PMGAG", "PVGAG", "PNGAG", "PMGCDS", "PVGCDS", "PNGCDS", "PMGCI", "PVGCI", "PNGCI", "PMGCBM", "PVGCBM", "PNGCBM", "PNGAIS", "PVGAIS", "PMGAIS"];

e.groupBasicPermArr = ["PNGB", "PVGB", "PMGBC", "PMGBU", "PMGBD"];

e.groupMemberPermArr = ["PNGMU", "PVGMU", "PNGMB", "PVGMB", "PMGMUC", "PMGMUD", "PMGMBC", "PMGMBD"];

let groupAllPermArr = [];

groupAllPermArr = [].concat.call(groupAllPermArr, e.groupRolesPermArr, e.groupBasicPermArr, e.groupMemberPermArr);

let roleIdMappingGroup = {
	"ADS": ["PMDSD", "PNDSD", "PVDSD", "PMDSE", "PNDSE", "PVDSE", "PMDSR", "PNDSR", "PVDSR", "PNDSB", "PVDSB", "PMDSBC", "PMDSBU", "PMDSBD", "PMDSPD", "PMDSPS", "PNDSPD", "PNDSPS", "PVDSIDPR", "PMDSIDPR", "PNDSIDPR", "PVDSIDPO", "PMDSIDPO", "PNDSIDPO", "PVDSIRSU", "PMDSIRSU", "PNDSIRSU", "PVDSIRAP", "PMDSIRAP", "PNDSIRAP", "PVDSIRRJ", "PMDSIRRJ", "PNDSIRRJ", "PVDSIRDI", "PMDSIRDI", "PNDSIRDI", "PVDSIRRW", "PMDSIRRW", "PNDSIRRW", "PVDSSDH", "PMDSSDH", "PNDSSDH", "PMDSSRE", "PVDSSRE", "PNDSSRE", "PVDSSEP", "PMDSSEP", "PNDSSEP", "PVDSSFS", "PMDSSFS", "PNDSSFS", "PVDSSPR", "PMDSSPR", "PNDSSPR", "PVDSAAP", "PNDSAAP", "PVDSASR", "PNDSASR", "PVDSAPO", "PNDSAPO", "PVDSAPR", "PNDSAPR", "PMDSSPD", "PNDSSPD", "PVDSSPD"],
	"AL": ["PML", "PVL", "PNL"],
	"ADF": ["PMDF", "PVDF", "PNDF"],
	"AP": ["PNPP", "PVPP", "PMPH", "PNPH", "PVPH", "PVPB", "PNPB", "PMPBC", "PMPBU", "PMPBD", "PNPFMB", "PVPFMB", "PMPFMBC", "PMPFMBD", "PMPFMBU", "PNPFPD", "PNPFPS", "PMPFPD", "PMPFPS", "PMPPC", "PMPPD", "PVPS", "PMPS", "PMPM", "PNPM"],
	"ANS": ["PMNSBC", "PMNSBU", "PMNSBD", "PVNSB", "PNNSB", "PMNSIO", "PVNSIO", "PNNSIO", "PVNSURL", "PMNSURL", "PNNSURL", "PVNSH", "PMNSH", "PNNSH"],
	"AA": ["PMABC", "PMABU", "PMABD", "PVAB", "PNAB", "PVAPW", "PMAPW", "PNAPW", "PMAEN", "PNAEN", "PMADL", "PNADL", "PMAS", "PNAS"],
	"AU": ["PMUBC", "PMUBCE", "PMUBU", "PMUBD", "PMUA", "PMUG", "PNUB", "PVUB", "PNUG", "PNUA"],
	"AB": ["PMBBC", "PMBBCE", "PMBBU", "PMBBD", "PMBA", "PMBG", "PNBB", "PVBB", "PNBG", "PNBA"],
	"ABM": ["PMBM", "PVBM", "PNBM"],
	"AG": JSON.parse((JSON.stringify(groupAllPermArr))),
	"AI": ["PNISDS", "PNISU", "PNISG", "PVISDS", "PVISU", "PVISG"]
};

e.validateRolesArray = function (roles, userRoles, type) {

	let functionName = type === "M" ? "every" : "filter";
	let ret = roles[functionName](_r => {
		if (_r.type === "appcenter") {
			let arr = [];
			if (_r.entity.startsWith("SRVC")) {
				arr = type === "M" ? ["PMGCDS"] : ["PMGCDS", "PVGCDS"];
			} else if (_r.entity.startsWith("INTR")) {
				arr = type === "M" ? ["PMGCI"] : ["PMGCI", "PVGCI"];
			} else if (_r.entity.startsWith("BM")) {
				arr = type === "M" ? ["PMGCBM"] : ["PMGCBM", "PVGCBM"];
			} else {
				throw new Error(_r.entity + " entity unknown in appcenter");
			}

			return userRoles.find(_ur => (arr.indexOf(_ur.id) > -1) && _ur.app === _r.app && _ur.entity === "GROUP");
		} else {
			let key = Object.keys(roleIdMappingGroup).find(_f => {
				return roleIdMappingGroup[_f].find(_i => _r.id === _i);
			});
			logger.debug({ key });
			if (key) {
				let pID = type === "M" ? ["PMG" + key] : [("PMG" + key), ("PVG" + key)];
				let flag = userRoles.find(_ur => (pID.indexOf(_ur.id) > -1) && _ur.app === _r.app && _ur.entity === "GROUP");
				let flag2 = _r.id.startsWith("PN") && _r.entity.indexOf("_") == -1;
				if (flag2) return true;
				if (!flag) logger.debug(JSON.stringify({ _r, key, flag }));
				return flag;
			} else {
				if (_r.id.startsWith("PN")) return true;
				throw new Error(_r.id + " roleID unknown in author");
			}
		}
	});
	// return type === 'M' ? !ret : ret;
	return ret;
};

e.compareUrl = (tempUrl, url) => {

	let tempUrlSegment = tempUrl.split("/").filter(_d => _d != "");
	let urlSegment = url.split("/").filter(_d => _d != "");

	if (tempUrlSegment.length != urlSegment.length) return false;
	let flag = tempUrlSegment.every((_k, i) => {
		if (_k.startsWith("{") && _k.endsWith("}") && urlSegment[i] != "") return true;
		return _k === urlSegment[i];
	});
	return flag;
};

e.getPermissions = (_req, entity, app) => {
	let promise = Promise.resolve();
	// fetching from cache only for that txn
	if (_req.path.startsWith("/api/c")) promise = cacheUtil.getCachedRoleAppcenter(entity, app, _req);
	return promise
		.then(_d => {
			if (_d) {
				logger.debug(`[${_req.headers.TxnId}] Fetched role from cache`);
				return _d;
			}
			let filterObj = {};
			if (entity) {
				if (Array.isArray(entity)) filterObj.entity = { "$in": entity };
				else filterObj.entity = entity;
			}
			if (app)
				filterObj.app = app;
			// if (filter) {
			//     filter = typeof filter === 'string' ? JSON.parse(filter) : filter;
			//     Object.assign(filterObj, filter);
			// }
			var options = {
				url: config.get("user") + "/rbac/role",
				method: "GET",
				headers: {
					"Content-Type": "application/json",
					"TxnId": _req.headers.TxnId,
					"Authorization": _req.get("Authorization"),
					"User": _req.user ? _req.user._id : null
				},
				qs: {
					filter: JSON.stringify(filterObj),
					count: -1
				},
				json: true
			};
			return new Promise((resolve, reject) => {
				request.get(options, function (err, res, body) {
					if (err) {
						logger.error(`[${_req.headers.TxnId}] ${err.message}`);
						reject(err);
					} else if (!res) {
						logger.error(`[${_req.headers.TxnId}] User Manager DOWN`);
						reject(new Error("User Manager DOWN"));
					} else {
						if (res.statusCode >= 200 && res.statusCode < 400) {
							//caching only for app center expand API
							if (_req.path.startsWith("/api/c")) {
								cacheUtil.cacheRoleAppcenter(entity, body);
								logger.debug(`[${_req.headers.TxnId}] Role cached`);
							}
							return resolve(body);
						}
						else {
							return reject(new Error(res.body.message ? res.body.message : "Cannot fetch permissions"));
						}
					}
				});
			});
		});

};

e.isNotNullObject = (obj) => {
	return obj && obj != null && typeof obj === "object";
};

e.isExisting = (val) => {
	return val || val === 0 || val === false;
};

e.flattenPermission = (permission, prevKey, permissionAllowed) => {
	let keyList = [];
	Object.keys(permission).forEach(key => {
		let newKey = prevKey == "" ? key : prevKey + "." + key;
		if (e.isNotNullObject(permission[key])) {
			if (permission[key]["_p"] && permissionAllowed.indexOf(permission[key]["_p"]) > -1) {
				keyList.push(newKey);
			} else {
				keyList = keyList.concat(e.flattenPermission(permission[key], newKey, permissionAllowed));
			}
		}
	});
	return keyList;
};

e.isSelectQueryAllowed = (req) => {
	return !req.path.endsWith("count");
};

e.getSelectQuery = (permission) => {
	let permissionAllowed = ["W", "R"];
	return e.flattenPermission(permission, "", permissionAllowed).toString();
};

e.validateSelectQuery = (permission, selectQuery) => {
	let permissionAllowed = ["W", "R"];
	selectQuery = selectQuery.split(",");
	selectQuery = selectQuery.filter(key => permissionAllowed.indexOf(key) > -1);
	return selectQuery.toString();
};

e.filterBody = (permission, permissionAllowed, reqBody, forFile) => {
	let newReqBody = {};
	if (e.isNotNullObject(permission)) {
		Object.keys(permission).forEach(key => {
			if (reqBody && e.isExisting(reqBody[key])) {
				if (e.isNotNullObject(permission[key])) {
					if (permission[key]["_p"]) {
						if (permissionAllowed.indexOf(permission[key]["_p"]) > -1) newReqBody[key] = reqBody[key];
					} else if (forFile && typeof reqBody[key] == "string" && Object.keys(permission[key]).length == 2
						&& permission[key]["value"] && permission[key]["checksum"] && permission[key]["value"]["_p"]) {
						// checking permission of secure field's value fields DEF3056
						if (permissionAllowed.indexOf(permission[key]["value"]["_p"]) > -1)
							newReqBody[key] = reqBody[key];
					} else {
						if (permission[key]["_id"] && permission[key]["_href"] && permissionAllowed.indexOf(permission[key]["_id"]["_p"]) > -1) newReqBody[key] = reqBody[key];
						else if (e.isNotNullObject(reqBody[key])) newReqBody[key] = e.filterBody(permission[key], permissionAllowed, reqBody[key], forFile);
					}
				}
			}
		});
	}
	if (!permission["_metadata"])
		newReqBody["_metadata"] = reqBody["_metadata"];
	return newReqBody;
};

e.checkPermission = (permission, permissionAllowed, reqBody) => {
	let isAllowed = true;
	let bodyKeys = Object.keys(reqBody);
	let mathOp = false;
	let allowedFields = null;
	if (bodyKeys.indexOf("$inc") > -1) {
		allowedFields = e.flattenPermission(permission, "", ["W"]);
		isAllowed = Object.keys(reqBody["$inc"]).every(_k => allowedFields.indexOf(_k) > -1);
		mathOp = true;
	}
	if (bodyKeys.indexOf("$mul") > -1) {
		if (!allowedFields) e.flattenPermission(permission, "", ["W"]);
		isAllowed = Object.keys(reqBody["$mul"]).every(_k => allowedFields.indexOf(_k) > -1);
		mathOp = true;
	}
	if (mathOp) return isAllowed;
	if (e.isNotNullObject(permission)) {
		Object.keys(reqBody).forEach(key => {
			if (permission && e.isExisting(permission[key])) {
				if (e.isNotNullObject(permission[key])) {
					if (permission[key]["_p"]) {
						if (permissionAllowed.indexOf(permission[key]["_p"]) === -1) {
							isAllowed = false;
							return;
						} else if (permission[key]["_r"]) {
							if (permission[key]["_t"] == "Number") {
								let range = permission[key]["_r"].split("to").map(_k => _k.trim());
								let isPercentage = range[0].endsWith("%");
								if (!isPercentage) {
									isAllowed = isAllowed && reqBody[key] >= range[0] && reqBody[key] <= range[1];
									if (!isAllowed) return;
								}
							}
							else if (permission[key]["_t"] == "String") {
								let allowedVal = permission[key]["_r"].split(",").map(_k => _k.trim());
								if (allowedVal.indexOf(reqBody[key]) === -1) {
									isAllowed = false;
									return;
								}
							}
							else if (permission[key]["_t"] == "Array") {
								let allowedVal = permission[key]["_r"].split(",").map(_k => _k.trim());
								if (reqBody[key].some(_k => allowedVal.indexOf(_k) == -1)) {
									isAllowed = false;
									return;
								}
							}
						}
					} else {
						if (e.isNotNullObject(reqBody[key])) isAllowed = isAllowed && e.checkPermission(permission[key], permissionAllowed, reqBody[key]);
						else {
							isAllowed = false;
							return;
						}
					}
				}
			} else {
				isAllowed = false;
				return;
			}
		});
	}
	return isAllowed;
};

e.hasAnyReadPermission = (permission) => {
	let flag = false;
	var BreakException = {};
	try {
		Object.keys(permission).forEach(key => {
			if (e.isNotNullObject(permission[key])) {
				if (permission[key]["_p"]) {
					if (permission[key]["_p"] === "W" || permission[key]["_p"] === "R") {
						flag = true;
						throw BreakException;
					}
				} else {
					flag = e.hasAnyReadPermission(permission[key]);
				}
			}
		});
	} catch (e) {
		if (e !== BreakException) throw e;
	}
	return flag;
};

let nonEditableField = ["_deleted", "_lastUpdated", "_createdAt", "__v", "_version", "_metadata"];

e.hasAllWritePermission = (permission, prevKey, ignoreKeyList) => {
	let flag = true;
	var BreakException = {};
	try {
		Object.keys(permission).forEach(key => {
			let newKey = prevKey ? prevKey + "." + key : key;
			if (e.isNotNullObject(permission[key])) {
				if (permission[key]["_p"]) {
					if (permission[key]["_p"] !== "W" && nonEditableField.indexOf(key) == -1) {
						flag = false;
						throw BreakException;
					}
				} else {
					flag = e.hasAllWritePermission(permission[key], newKey, ignoreKeyList);
				}
			}
		});
	} catch (e) {
		if (e !== BreakException) throw e;
	}
	return flag;
};

function computeRestriction(a, b, type) {
	if ((!a || !b) && (a !== 0 || b !== 0)) {
		return null;
	}
	if (type === "Number") {
		let range = [];
		let rangeA = a.split("to").map(_k => _k.trim());
		let rangeB = b.split("to").map(_k => _k.trim());
		let isAPercent = rangeA[0].endsWith("%");
		let isBPercent = rangeB[0].endsWith("%");
		if (isAPercent ^ isBPercent) {
			return isAPercent ? rangeB[0] + " to " + rangeB[1] : rangeA[0] + " to " + rangeA[1];
		}
		range.push(Math.min(isAPercent ? parseInt(rangeA[0].substr(0, rangeA[0].length - 1)) : parseInt(rangeA[0]), isBPercent ? parseInt(rangeB[0].substr(0, rangeB[0].length - 1)) : parseInt(rangeB[0])));
		range.push(Math.max(isAPercent ? parseInt(rangeA[1].substr(0, rangeA[1].length - 1)) : parseInt(rangeA[1]), isBPercent ? parseInt(rangeB[1].substr(0, rangeB[1].length - 1)) : parseInt(rangeB[1])));
		return isAPercent ? range[0] + "% to " + range[1] + "%" : range[0] + " to " + range[1];
	}
	if (type === "String" || type === "Array") {
		return _.uniq(a.split(",").map(_k => _k.trim()).concat(b.split(",").map(_k => _k.trim()))).toString();
	}
}

function priority(a, b, type) {
	let priority = ["N", "R", "W"];
	if (!b) return a;
	let index = Math.max(priority.indexOf(a["_p"]), priority.indexOf(b["_p"]));
	let per = {};
	per["_p"] = index > -1 ? priority[index] : a;
	if (a["_p"] == "W" && b["_p"] == "W") {
		per["_r"] = computeRestriction(a["_r"], b["_r"], type);
	} else if (a["_p"] == "W") {
		per["_r"] = a["_r"];
	} else if (b["_p"] == "W") {
		per["_r"] = b["_r"];
	}
	per["_t"] = type;
	return per;
}

e.getHighestPermission = (allPermission, allowedPermission, isAdminUser) => {

	let highestPermission = JSON.parse(JSON.stringify(allPermission));
	Object.keys(allPermission).forEach(key => {
		if (e.isNotNullObject(allPermission[key])) {
			if (allPermission[key]["_p"] && e.isNotNullObject(allPermission[key]["_p"])) {
				let permission = [];
				Object.keys(allPermission[key]["_p"]).forEach(permKey => {
					if (isAdminUser || allowedPermission.indexOf(permKey) > -1) {
						permission.push({ "_p": allPermission[key]["_p"][permKey], "_r": allPermission[key]["_r"] ? allPermission[key]["_r"][permKey] : null });
					}
				});
				let highestPerm = permission.length > 0 ? permission.reduce((_p, _c) => priority(_p, _c, allPermission[key]["_t"]), { "_p": "N" }) : { "_p": "N" };
				highestPermission[key] = highestPerm;
			} else if (allPermission[key]["_p"] === null) {
				highestPermission[key] = { "_p": "N" };
			} else {
				highestPermission[key] = e.getHighestPermission(allPermission[key], allowedPermission, isAdminUser);
			}
		}
	});
	return highestPermission;
};

let manipulateBody = (body, req) => {
	let newData = null;
	let forFile = req.query.forFile;
	if (!req.path.endsWith("/secret/enc") && !req.path.startsWith("/api/a/mon") && !e.compareUrl("/api/a/sec/enc/{appName}/decrypt", req.path) && !req.path.startsWith("/api/a/sm/calendar")) {
		try {
			let highestPermission = req._highestPermission ? req._highestPermission.find(_hp => _hp.method == "GET") : null;
			if (highestPermission) {
				highestPermission = highestPermission.fields;
			}
			if (!highestPermission || _.isEmpty(highestPermission)) {
				newData = { "message": "No permission" };
			} else if (typeof body === "object") {
				newData = Array.isArray(body) ? body.map(obj => e.filterBody(highestPermission, ["W", "R"], obj, forFile)) : e.filterBody(highestPermission, ["W", "R"], body, forFile);
			} else {
				newData = body;
			}
		} catch (err) {
			logger.error(`[${req.headers.TxnId}] ${err.message}`);
			newData = {
				message: err.message
			};
		}
		return newData;
	}
	else {
		return body;
	}

};

e.isUrlPermitted = (permittedUrls, req) => {
	let permitted = false;
	const allowedApiEndPoint = ["file", "hook"];
	if (permittedUrls) {
		permittedUrls.forEach(url => {
			if (req.path.startsWith(url)) {
				permitted = true;
				return;
			}
		});
		if (permitted) return true;
	}
	if (req.path.startsWith("/api/a/sm") && req.method == "GET") {
		return true;
	}
	if (req.path.startsWith("/api/c") && allowedApiEndPoint.indexOf(req.path.split("/")[5]) > -1) {
		return true;
	}
	else if (e.compareUrl("/api/a/mon/appCenter/{SRVC}/logs", req.path) || e.compareUrl("/api/a/mon/appCenter/{SRVC}/logs/count", req.path) || e.compareUrl("/api/a/mon/appCenter/{SRVC}/postHook", req.path) || e.compareUrl("/api/a/mon/appCenter/{SRVC}/postHook/count", req.path) || e.compareUrl("/api/a/mon/appCenter/{SRVC}/preHook", req.path) || e.compareUrl("/api/a/mon/appCenter/{SRVC}/preHook/count", req.path) || e.compareUrl("/api/a/mon/author/sm/audit", req.path) || e.compareUrl("/api/a/mon/author/sm/audit/count", req.path)) {
		return false;
	}
	else if (req.path.startsWith("/api/a/mon")) {
		if (req.path.startsWith("/api/a/mon/dataService/log")
			|| req.path.startsWith("/api/a/mon/author/user/log")
			|| req.path.startsWith("/api/a/mon/author/group/log"))
			return false;
		else
			return true;
	}
	else if (req.path.startsWith("/api/a/route")) {
		return true;
	}
	else if (req.path.startsWith("/api/a/sec/identity")) {
		return true;
	}
	else if (req.path.startsWith("/api/a/de")) {
		return true;
	} else if (e.compareUrl("/api/c/{app}/{dataService}/utils/fileTransfers/{fileId}/readStatus", req.path)) {
		return true;
	}
	return permitted;
};

e.getProxyReqHandler = () => {
	return (req) => {
		// if (req.method == "GET") {
		//     // if (authUtil.hasAnyReadPermission(highestPermission)) _req._highestPermission = highestPermission;
		//     if (e.isSelectQueryAllowed(req)) {
		//         req.query.select = req.query.select ? e.validateSelectQuery(req._highestPermission, req.query.select) : e.getSelectQuery(req._highestPermission);
		//     }
		//     req.url = req.url + "%2Cselect%3D_id"
		// }

		if (req.body) {
			//let bodyData = JSON.stringify(req.body);
			//proxyReq.setHeader("Content-Type", "application/json");
			//proxyReq.setHeader("Content-Length", Buffer.byteLength(bodyData));
			//proxyReq.write(bodyData);
		}
	};
};

function hasCUDPerm(highestPermission) {
	let cudArr = ["POST", "PUT", "DELETE"];
	let allPer = highestPermission ? highestPermission.map(_h => _h.method) : [];
	return cudArr.some(_c => allPer.indexOf(_c) > -1);
}

function hasApproveViewPerm(highestPermission) {
	let cudArr = ["POST", "PUT", "DELETE", "REVIEW"];
	let allPer = highestPermission ? highestPermission.map(_h => _h.method) : [];
	let wfFlag = cudArr.some(_c => allPer.indexOf(_c) > -1);
	if (wfFlag) return true;
	else {
		let getObj = highestPermission.find(_o => _o.method === "GET");
		return getObj && getObj.workflowRoles && getObj.workflowRoles.length > 0;
	}
}

// function decryptText(_d, app) {
// 	if (!_d) return Promise.resolve("");
// 	var options = {
// 		url: `${config.get("sec")}/sec/enc/${app}/decrypt`,
// 		method: "POST",
// 		headers: {
// 			"Content-Type": "application/json",
// 		},
// 		body: { data: _d },
// 		json: true
// 	};
// 	return new Promise((resolve, reject) => {
// 		request.post(options, function (err, res, body) {
// 			if (err) {
// 				logger.error("Error requesting Security service");
// 				reject(err);
// 			} else if (!res) {
// 				logger.error("Security service down");
// 				reject(new Error("Security service down"));
// 			}
// 			else {
// 				if (res.statusCode === 200) {
// 					resolve(body.data);
// 				} else {
// 					logger.error("Error decrypting text");
// 					resolve(_d);
// 				}
// 			}
// 		});
// 	});
// }

// function decryptData(data, nestedKey, app, forFile) {
// 	let keys = nestedKey.split(".");
// 	if (keys.length == 1) {
// 		if (data[keys[0]]) {
// 			if (Array.isArray(data[keys[0]])) {
// 				let promises = data[keys[0]].map(_d => {
// 					return decryptText(_d.value, app)
// 						.then(_decrypted => {
// 							if (forFile)
// 								_d = _decrypted;
// 							else
// 								_d.value = _decrypted;
// 							return _d;
// 						});
// 				});
// 				return Promise.all(promises)
// 					.then(_d => {
// 						data[keys[0]] = _d;
// 						return data;
// 					});
// 			} else if (data[keys[0]] && typeof data[keys[0]].value == "string") {
// 				return decryptText(data[keys[0]].value, app)
// 					.then(_d => {
// 						if (forFile)
// 							data[keys[0]] = _d;
// 						else
// 							data[keys[0]].value = _d;
// 						return data;
// 					});
// 			}
// 		} else {
// 			return Promise.resolve(data);
// 		}
// 	} else {
// 		if (data[keys[0]]) {
// 			let ele = keys.shift();
// 			let newNestedKey = keys.join(".");
// 			if (Array.isArray(data[ele])) {
// 				let promises = data[ele].map(_d => decryptData(_d, newNestedKey, app, forFile));
// 				return Promise.all(promises)
// 					.then(_d => {
// 						data[ele] = _d;
// 						return data;
// 					});
// 			}
// 			return decryptData(data[ele], newNestedKey, app, forFile).then(() => data);
// 		} else {
// 			return Promise.resolve(data);
// 		}
// 	}
// }

// function decryptArrData(data, nestedKey, app, forFile) {
// 	let promises = data.map(_d => decryptData(_d, nestedKey, app, forFile));
// 	return Promise.all(promises);
// }
//
// function getSecuredFields(app, api, req) {
// 	let url = null;
// 	if (process.env.KUBERNETES_SERVICE_HOST && process.env.KUBERNETES_SERVICE_PORT) {
// 		url = "http://" + api.toLowerCase() + "." + config.odpNS + "-" + app.toLowerCase().replace(/ /g, "") + `/${app}/${api}/utils/securedFields`;
// 	} else {
// 		let host = global.masterServiceRouter[app + "/" + api];
// 		if (host) {
// 			url = host + `/${app}/${api}/utils/securedFields`;
// 		} else {
// 			return Promise.reject(new Error("AppCenter host not found"));
// 		}
// 	}
// 	let options = {
// 		url: url,
// 		method: "GET",
// 		headers: {
// 			"Content-Type": "application/json",
// 			"TxnId": req.get("TxnId") ? req.get("TxnId") : gwUtil.getTxnId(req),
// 			"Authorization": req.get("Authorization"),
// 			"User": req.get("user")
// 		},
// 		json: true
// 	};
// 	return new Promise((resolve, reject) => {
// 		request.get(options, function (err, res, body) {
// 			if (err) {
// 				logger.error(err.message);
// 				reject(err);
// 			} else if (!res) {
// 				logger.error("Service DOWN");
// 				reject(new Error("Service DOWN"));
// 			}
// 			else {
// 				if (res.statusCode >= 200 && res.statusCode < 400) {
// 					resolve(body);
// 				} else {
// 					reject(new Error(res.body && res.body.message ? "Request failed:: " + res.body.message : "Request failed"));
// 				}
// 			}
// 		});
// 	});
// }

function SMobjectValidate(req, smObject, allPermArr, msType) {
	logger.debug({ smObject });
	if (req.user.isSuperAdmin) return smObject;
	let appsAllowed = null;
	let accessLevel = req.user.accessControl.accessLevel;
	if (accessLevel == "Selected") {
		appsAllowed = req.user.accessControl.apps ? req.user.accessControl.apps.map(obj => obj._id) : [];
	}
	if (accessLevel == "Selected" && appsAllowed.indexOf(smObject.app) > -1) return smObject;
	if (req.user.roles.find(_r => _r.entity === smObject._id && _r.type === "appcenter")) {
		return smObject;
	}
	if (req.path.startsWith("/api/a/sm") && req.method == "GET" && (!req.user.roles || req.user.roles.length == 0)) {
		throw new Error("Access Denied");
	}
	let flag = false;
	let expFlag = false;
	if (msType === "PM") {
		expFlag = req.user.roles.find(_r => _r.entity === ("PM_" + smObject._id) && _r.app === smObject.app);
		// if(expFlag) return smObject;
		if (expFlag) {
			allPermArr = allPermArr.filter(allPerm => allPerm.entity === "PM_" + smObject._id);
		}
		let noFlag = req.user.roles.find(_r => (_r.entity === "PM_" + smObject._id) && _r.app === smObject.app && (_r.id === "PNP"));
		flag = req.user.roles.find(_r => (_r.entity === "PM_" + smObject._id || _r.entity === "PM") && _r.app === smObject.app && (_r.id === "PMP" || _r.id === "PVP"));
		let manageGroupFlag = req.user.roles.find(_r => (_r.id === "PMGAP" || _r.id === "PVGAP") && _r.app === smObject.app && _r.entity === "GROUP");
		flag = (manageGroupFlag || (flag && !noFlag));
	} else {
		expFlag = req.user.roles.find(_r => _r.entity === ("SM_" + smObject._id) && _r.app === smObject.app);
		if (expFlag) {
			allPermArr = allPermArr.filter(allPerm => allPerm.entity === "SM_" + smObject._id);
		}
		let noFlag = req.user.roles.find(_r => (_r.entity === "SM_" + smObject._id) && _r.app === smObject.app && (_r.id === "PNDS"));
		flag = req.user.roles.find(_r => _r.entity === smObject._id || (_r.entity === "SM_" + smObject._id && _r.app === smObject.app && (_r.id === "PMDS" || _r.id === "PVDS")) || (_r.entity === "SM" && (_r.id === "PMDS" || _r.id === "PVDS") && _r.app === smObject.app));
		flag = (flag && !noFlag);
	}
	if (flag) return smObject;
	let getHPerm = null;
	allPermArr.forEach(allPerm => {
		allPerm.fields = JSON.parse(allPerm.fields);
		let userPermission = req.user.roles.filter(_r => (_r.app === allPerm.app) && (_r.entity === allPerm.entity)).map(_o => _o.id);
		let permObj = e.computeMethodAllowed(userPermission, allPerm, req.user.isAdminUser);
		let getFields = permObj.find(_p => _p.method === "GET");
		if (getFields) {
			getFields = getFields.fields;
			getHPerm = getHPerm ? e.maxPriorityFieldCalculater(getHPerm, getFields) : getFields;
		}
	});
	logger.debug(JSON.stringify(getHPerm));
	if (getHPerm) {
		let returnObj = e.filterBody(getHPerm, ["W", "R"], smObject);
		let isGroupRole = req.user.roles.find(_r => _r.entity === "GROUP" && (["PMGADS", "PVGADS", "PMGCDS", "PVGCDS"].indexOf(_r.id) > -1) && _r.app === smObject.app);
		let isDSInsightRole = req.user.roles.find(_r => _r.entity === "INS" && _r.id === "PVISDS" && _r.app === smObject.app);
		if ((!returnObj.name) && (isGroupRole || isDSInsightRole)) {
			returnObj._id = smObject._id;
			returnObj.name = smObject.name;
			if (msType == "SM") {
				returnObj.attributeCount = smObject.attributeCount;
			}
			if (msType == "PM") {
				returnObj.flows = smObject.flows;
			}
		}
		return returnObj;
	} else {
		return null;
	}
}

e.maxPriorityFieldCalculater = (fields1, fields2) => {
	let highestPermission = JSON.parse(JSON.stringify(fields1));
	Object.keys(fields1).forEach(key => {
		if (e.isNotNullObject(fields1[key])) {
			if (fields1[key]["_p"]) {
				highestPermission[key] = priority(fields1[key], fields2[key], fields1[key]["_t"]);
			} else if (fields1[key]["_p"] === null) {
				highestPermission[key] = { "_p": "N" };
			} else {
				highestPermission[key] = e.maxPriorityFieldCalculater(fields1[key], fields2[key]);
			}
		}
	});
	return highestPermission;
};

function SMResHandler(req, resBody, res) {
	if (e.compareUrl("/api/a/sm/{srvcId}/deploy", req.path) || e.compareUrl("/api/a/sm/{srvcId}/stop", req.path) || e.compareUrl("/api/a/sm/{srvcId}/start", req.path) || e.compareUrl("/api/a/sm/{srvcId}/repair", req.path) || e.compareUrl("/api/a/sm/{srvcId}/purge/{type}", req.path) || e.compareUrl("/api/a/sm/{srvcId}/draftDelete", req.path)) {
		let entity = req.path.split("/")[4];
		cacheUtil.deleteCachedRoleAppcenter(entity);
		return Promise.resolve(resBody);
	}
	if (e.compareUrl("/api/a/sm/{app}/service/start", req.path) || e.compareUrl("/api/a/sm/{app}/service/stop", req.path)) {
		return Promise.resolve(resBody);
	}
	let validUrlList = ["/api/a/sm/service/{srvcId}", "/api/a/sm/service", "/api/a/sm/globalSchema/{id}", "/api/a/sm/globalSchema", "/api/a/pm/partner/{id}", "/api/a/pm/partner", "/api/a/pm/nanoService/{id}", "/api/a/pm/nanoService"];
	if (!validUrlList.some(_url => e.compareUrl(_url, req.path))) return null;
	// if (!(e.compareUrl('/api/a/sm/service/{srvcId}', req.path) || e.compareUrl('/api/a/sm/service', req.path) || e.compareUrl('/api/a/sm/globalSchema/{id}', req.path) || e.compareUrl('/api/a/sm/globalSchema', req.path))) return Promise.resolve(null);
	if (!(res.statusCode >= 200 && res.statusCode < 400)) return Promise.resolve(resBody);
	let smType = "GS";
	if (e.compareUrl("/api/a/sm/service/{srvcId}", req.path) || e.compareUrl("/api/a/sm/service", req.path)) {
		smType = "SM";
	}
	if (e.compareUrl("/api/a/pm/partner/{id}", req.path) || e.compareUrl("/api/a/pm/partner", req.path)) {
		smType = "PM";
	}
	if (e.compareUrl("/api/a/pm/nanoService/{id}", req.path) || e.compareUrl("/api/a/pm/nanoService", req.path)) {
		smType = "NS";
	}
	let srvcIds = null;
	let promise = null;
	if (req.user.isSuperAdmin) return Promise.resolve(resBody);
	if (Array.isArray(resBody)) {
		srvcIds = resBody.map(_srvc => _srvc._id);
		srvcIds = srvcIds.filter(_s => _s);
		let entityArr = srvcIds.map(_s => smType + "_" + _s);
		entityArr.push(smType);
		promise = e.getPermissions(req, entityArr);
	} else {
		promise = e.getPermissions(req, [smType + "_" + resBody._id, smType], resBody.app);
	}
	return promise
		.then(allPermArr => {
			let newResBody = null;
			if (Array.isArray(resBody)) {
				newResBody = resBody.map(body => {
					if (!body._id) return null;
					let newAllPermissionArr = allPermArr.filter(_ap => _ap.app === body.app && (_ap.entity === smType || _ap.entity === smType + "_" + body._id));
					return SMobjectValidate(req, body, JSON.parse(JSON.stringify(newAllPermissionArr)), smType);
				});
				newResBody = newResBody.filter(_r => (_r && Object.keys(_r).length > 0));
			} else {
				let body = resBody;
				if (!body._id) resBody = null;
				let newAllPermissionArr = allPermArr.filter(_ap => _ap.app === body.app && (_ap.entity === smType || _ap.entity === smType + "_" + body._id));
				newResBody = SMobjectValidate(req, body, JSON.parse(JSON.stringify(newAllPermissionArr)), smType);
			}
			return newResBody ? newResBody : {};
		});
}

function userModify(_usr, details) {
	if (details.globalUserList.indexOf(_usr._id) > -1 || _usr.isSuperAdmin) {
		if ((details.globalappList && details.globalappList.length === 0)) {
			return {
				_id: _usr._id,
				username: _usr.username,    //username updates here?
				basicDetails: _usr.basicDetails,
				bot: _usr.bot
			};
		}
		return _usr;
	} else if (_usr.bot && details.botList.indexOf(_usr._id) > -1) {
		if ((details.botAppList && details.botAppList.length === 0)) {
			return {
				_id: _usr._id,
				username: _usr.username,
				basicDetails: _usr.basicDetails,
				bot: _usr.bot
			};
		}
		return _usr;
	}
	else if (!_usr.bot && details.userList.indexOf(_usr._id) > -1) {
		if ((details.userAppList && details.userAppList.length === 0)) {
			return {
				_id: _usr._id,
				username: _usr.username,
				basicDetails: _usr.basicDetails,
				bot: _usr.bot
			};
		}
		return _usr;
	}
	else {
		return {};
	}
}

function userResponseModify(resBody, details) {
	if (Array.isArray(resBody)) {
		resBody = resBody.map(_usr => {
			return userModify(_usr, details);
		});
		return Promise.resolve(resBody);
	} else if (typeof resBody === "object") {
		let usr = userModify(resBody, details);
		if (Object.keys(usr).length === 0) return Promise.reject("Access Denied");
		return Promise.resolve(usr);
	}
}

function modifyGroupObject(resBody, req, usersDetail) {
	let appList = req.user.roles.filter(_r => (["PMGBC", "PMGBU", "PMGBD", "PVGB"].indexOf(_r.id) > -1) && _r.entity === "GROUP").map(_r => _r.app);
	let muAppList = req.user.roles.filter(_r => (["PMBG", "PMUG"].indexOf(_r.id) > -1) && _r.entity === "USER").map(_r => _r.app);
	if (appList.concat(muAppList).indexOf(resBody.app) === -1) {
		return null;
	}
	resBody.roles = resBody.roles ? e.validateRolesArray(resBody.roles, req.user.roles, "V") : undefined;
	if (resBody.users && resBody.users.length > 0) {
		let userRolesFlag = req.user.roles.find(_r => (["PVGMU", "PMGMUC", "PMGMUD"].indexOf(_r.id) > -1) && _r.app === resBody.app);
		let botRolesFlag = req.user.roles.find(_r => (["PVGMB", "PMGMBC", "PMGMBD"].indexOf(_r.id) > -1) && _r.app === resBody.app);
		if (!userRolesFlag) {
			resBody.users = resBody.users.filter(_uId => !(usersDetail.find(_u => _u._id === _uId && !_u.bot)));
		}
		if (!botRolesFlag) {
			resBody.users = resBody.users.filter(_uId => !(usersDetail.find(_u => _u._id === _uId && _u.bot)));
		}
	}
	return resBody;
}

function userResHandler(req, resBody, res) {
	if ((e.compareUrl("/api/a/rbac/usr", req.path) || e.compareUrl("/api/a/rbac/usr/{id}", req.path)) && req.method === "GET" && res.statusCode >= 200 && res.statusCode < 400) {
		if (req.user.isSuperAdmin) return Promise.resolve(resBody);
		let accessLevel = req.user.accessControl.accessLevel;
		let appsAllowed = null;
		if (accessLevel == "Selected") {
			appsAllowed = req.user.accessControl.apps.map(obj => obj._id);
		}
		let globalappList = accessLevel == "Selected" ? appsAllowed : [];
		let globalUserList = [req.user._id];
		let userAppList = req.user.roles.filter(_r => ((_r.id.startsWith("PMU") || _r.id.startsWith("PVU")) && _r.entity === "USER")).map(_r => _r.app);
		let botAppList = req.user.roles.filter(_r => ((_r.id.startsWith("PMB") || _r.id.startsWith("PVB")) && _r.entity === "USER")).map(_r => _r.app);
		let userList = null;
		let botList = null;
		return global.mongoConnectionAuthor.collection("userMgmt.groups").find({ "$or": [{ app: { $in: globalappList } }, { "users": req.user._id }] }).toArray()
			.then(_grps => {
				globalUserList = [].concat.apply(globalUserList, _.uniq(_grps.map(_g => _g.users)));
				return global.mongoConnectionAuthor.collection("userMgmt.groups").find({ app: { $in: userAppList } }).toArray();
			})
			.then(_grps => {
				userList = _.uniq(_grps.map(_g => _g.users));
				return global.mongoConnectionAuthor.collection("userMgmt.groups").find({ app: { $in: botAppList } }).toArray();
			})
			.then(_grps => {
				botList = _.uniq(_grps.map(_g => _g.users));
				let details = {
					globalappList,
					userAppList,
					botAppList,
					globalUserList,
					botList,
					userList
				};
				return userResponseModify(resBody, details);
			});
	}
	else if ((e.compareUrl("/api/a/rbac/group", req.path)) && req.method === "GET" && res.statusCode >= 200 && res.statusCode < 400) {
		if (req.user.isSuperAdmin) return Promise.resolve(resBody);
	}
	else if ((e.compareUrl("/api/a/rbac/group/{id}", req.path)) && (req.method === "GET" || req.method === "PUT") && res.statusCode >= 200 && res.statusCode < 400) {
		if (req.user.isSuperAdmin) return Promise.resolve(resBody);
		let accessLevel = req.user.accessControl.accessLevel;
		let appsAllowed = null;
		if (accessLevel == "Selected") {
			appsAllowed = req.user.accessControl.apps.map(obj => obj._id);
		}
		let appList = accessLevel == "Selected" ? appsAllowed : [];
		logger.debug(JSON.stringify({ resBody }));
		if (!resBody.app) {
			return Promise.reject(new Error("App not found"));
		}
		if (appList.indexOf(resBody.app) > -1) return Promise.resolve(resBody);
		return (resBody.users && resBody.users.length > 0 ? global.mongoConnectionAuthor.collection("userMgmt.users").find({ _id: { $in: resBody.users } }, { bot: 1 }).toArray() : Promise.resolve([]))
			.then(_users => {
				let obj = modifyGroupObject(resBody, req, _users);
				if (obj === null) {
					return Promise.reject(new Error("Access Denied"));
				} else {
					return Promise.resolve(obj);
				}
			});
		// return global.mongoConnectionAuthor.collection('userMgmt.groups').find({ app: { $in: appList } }).toArray()
		//     .then(_grps => {
		//         groupList = _grps.map(_g => _g._id);
		//         if (Array.isArray(resBody)) {
		//             resBody = resBody.map(_grp => {
		//                 if (groupList.indexOf(_grp._id) > -1) {
		//                     return _grp;
		//                 } else {
		//                     return {};
		//                 }
		//             });
		//             return resBody;
		//         } else if (typeof resBody === 'object') {
		//             if (groupList.indexOf(resBody._id) > -1) {
		//                 return resBody;
		//             } else {
		//                 return Promise.reject('Access Denied');
		//             }
		//         }
		//     });
	}
	else if ((e.compareUrl("/api/a/rbac/{app}/group", req.path)) && req.method === "GET" && res.statusCode >= 200 && res.statusCode < 400) {
		if (req.user.isSuperAdmin) return Promise.resolve(resBody);
		let accessLevel = req.user.accessControl.accessLevel;
		let appsAllowed = null;
		if (accessLevel == "Selected") {
			appsAllowed = req.user.accessControl.apps.map(obj => obj._id);
		}
		let appList = accessLevel == "Selected" ? appsAllowed : [];
		let pathSplit = req.path.split("/");
		let app = pathSplit[4];
		if (appList.indexOf(app) > -1) return Promise.resolve(resBody);
		let userList = [];
		logger.debug(JSON.stringify(resBody));
		resBody.forEach(_grp => {
			if (_grp.users) userList = userList.concat(_grp.users);
		});
		userList = _.uniq(userList);
		return (userList && userList.length > 0 ? global.mongoConnectionAuthor.collection("userMgmt.users").find({ _id: { $in: userList } }, { bot: 1 }).toArray() : Promise.resolve([]))
			.then(_users => {
				let newResp = resBody.map(_obj => {
					_obj.app = app;
					return modifyGroupObject(_obj, req, _users);
				});
				newResp = newResp.filter(_a => _a);
				return Promise.resolve(newResp);
			});
	}
	else {
		return Promise.resolve(null);
	}
}

e.getProxyResHandler = (permittedUrls) => {
	return (req, res, body) => {
		// if (res.statusCode > 300 && res.statusCode < 500) {
		// 	try {
		// 		let nBody = typeof body === "string" ? JSON.parse(body) : body;
		// 		let resData = JSON.parse(JSON.stringify(nBody));
		// 		if (Array.isArray(nBody)) {
		// 			resData = nBody.map((e) => {
		// 				if (e.message && e.message.indexOf("E11000 duplicate key error collection") > -1) {
		// 					e.message = "ID already exists";
		// 				}
		// 				return e;
		// 			});
		// 		} else {
		// 			if (resData.message && resData.message.indexOf("E11000 duplicate key error collection") > -1) {
		// 				resData.message = "ID already exists";
		// 			}
		// 		}
		// 		return res.status(res.statusCode).json(resData);
		// 	} catch (err) {
		// 		logger.error(err);
		// 		return res.status(res.statusCode).send(body);
		// 	}
		// }
		if (res.statusCode < 200 || res.statusCode >= 400) {
			try {
				logger.debug(`[${req.headers.TxnId}] getProxyResHandler : ${JSON.stringify(body)}`);
				logger.debug(`[${req.headers.TxnId}] getProxyResHandler : ${typeof body}`);
				let nBody = typeof body === "string" ? JSON.parse(body) : body;
				logger.debug(`[${req.headers.TxnId}] ${JSON.stringify({ nBody })}`);
				if (!Array.isArray(nBody) && !nBody.message) res.status(res.statusCode).json({ message: "Internal Server Error" });
			} catch (err) {
				logger.error(`[${req.headers.TxnId}] ${err}`);
				return res.status(res.statusCode).send(body);
			}
		}
		if (req.path.startsWith("/api/a/rbac")) {
			if (Array.isArray(body)) {
				body = body.map(_usr => {
					if (typeof _usr === "object") {
						delete _usr.salt;
						delete _usr.password;
					}
					return _usr;
				});
			} else if (body && typeof body === "object") {
				delete body.salt;
				delete body.password;
			}
		}
		if (e.compareUrl("/api/a/pm/agentRegistry", req.path) && Array.isArray(body)) {
			body = body.map(_b => {
				if (typeof _b === "object") delete _b.password;
				return _b;
			});
		}
		if (e.compareUrl("/api/a/pm/agentRegistry/{id}", req.path)) {
			delete body.password;
		}
		let splitUrl = req.path.split("/");
		if (req.path.startsWith("/api/a/pm") && splitUrl[4] !== "partner" && splitUrl[4] !== "nanoService") {
			return res.json(body);
		}
		if (req.path.startsWith("/api/c/") && splitUrl[5] && splitUrl[5] == "utils" 
			&& splitUrl[6] && splitUrl[6] == "workflow") {
			return res.json(body);
		}
		if (req.path.startsWith("/api/a/faas/")) {
			return res.json(body);
		}
		if (req.path.startsWith("/api/common")) {
			return res.json(body);
		}
		// ODP code
		// if (req.path.startsWith("/api/a/workflow")) {
		// 	return res.json(body);
		// }

		userResHandler(req, body, res)
			.then(_usrRes => {
				if (_usrRes) {
					res.json(_usrRes);
					return;
				}
				return SMResHandler(req, body, res);
			}, (err) => {
				res.status(403).json({ message: err.message });
				return;
			})
			.then(_smRes => {
				if (_smRes) return res.json(_smRes);
				if ((req.path === "/api/a/rbac/login" || req.path === "/api/a/rbac/refresh" || req.path === "/api/a/rbac/check") && res.statusCode === 200) {
					let domain = process.env.FQDN ? process.env.FQDN.split(":").shift() : "localhost";
					let cookieJson = {};
					if (domain != "localhost") {
						cookieJson = {
							expires: new Date(body.expiresIn),
							httpOnly: true,
							sameSite: true,
							secure: true,
							domain: domain,
							path: "/api/"
						};
					}
					res.cookie("Authorization", "JWT " + body.token, cookieJson);
				}
				if (res.headersSent) return;
				// if (req.path.startsWith('/api/a/sm') && req.method == 'GET') {
				//     if (!req.user.isSuperAdmin && (!req.user.roles || req.user.roles.length == 0)) {
				//         return res.status(403).json({ 'message': 'No permission' });
				//     } else {
				//         return res.json(body);
				//     }
				// } else 
				if (e.isUrlPermitted(permittedUrls, req)) {
					return res.json(body);
				} else {
					if (res.statusCode < 200 || res.statusCode >= 400) {
						return res.send(body);
					}
					// let reqPath = req.originalUrl.split("?")[0];
					// let isAppCenter = false;
					// let splitPath = reqPath.split("/");
					// if (splitPath[2] === "c") isAppCenter = true;
					if (hasCUDPerm(req._highestPermission)) {
						return res.json(body);
						// let promise = null;
						// if (isAppCenter) {
						// 	let app = splitPath[3];
						// 	if (e.compareUrl("/api/c/{app}/{service}/utils/simulate", reqPath)) {
						// 		promise = Promise.resolve(body);
						// 	}
						// 	else {
						// 		promise = getSecuredFields(splitPath[3], splitPath[4], req)
						// 			.then(secureFields => {
						// 				let forFile = req.query.forFile;
						// 				return secureFields.reduce((acc, curr) => {
						// 					return acc.then(_d => Array.isArray(_d) ? decryptArrData(_d, curr, app, forFile) : decryptData(_d, curr, app, forFile));
						// 				}, Promise.resolve(body));
						// 			});
						// 	}
						// } else {
						// 	promise = Promise.resolve(body);
						// }
						// return promise.then(_d => {
						// 	res.json(_d);
						// })
						// 	.catch(err => {
						// 		res.status(500).json({ message: err.message });
						// 	});
					}
					let highestPermission = req._highestPermission ? req._highestPermission.find(_hp => _hp.method == "GET") : null;
					if (highestPermission) {
						highestPermission = highestPermission.fields;
					}
					// let urlArr = req.path.split('/');
					if (res.statusCode < 200 || res.statusCode >= 400) {
						return res.send(body);
					}
					// let promise = Promise.resolve(body);
					// if (isAppCenter) {
					// 	let app = splitPath[3];
					// 	promise = getSecuredFields(splitPath[3], splitPath[4], req)
					// 		.then(secureFields => {
					// 			let forFile = req.query.forFile;
					// 			return secureFields.reduce((acc, curr) => {
					// 				return acc.then(_d => Array.isArray(_d) ? decryptArrData(_d, curr, app, forFile) : decryptData(_d, curr, app, forFile));
					// 			}, Promise.resolve(body));
					// 		});
					// } else {
					// 	promise = Promise.resolve(body);
					// }
					// promise.then((_d) => {
					// 	body = JSON.parse(JSON.stringify(_d));
					let appcenterPermittedURL = ["/api/c/{app}/{api}/utils/filetransfers", "/api/c/{app}/{service}/utils/experienceHook"];
					if (req.user.isSuperAdmin || hasCUDPerm(req._highestPermission) || appcenterPermittedURL.some(_u => e.compareUrl(_u, req.path))) {
						return res.json(body);
					}
					let output = manipulateBody(body, req);
					return res.json(output);
					// })
					// 	.catch(err => {
					// 		res.status(500).json({ message: err.message });
					// 	});
					/*    
					if (urlArr[5] && (urlArr[5] == 'audit') || req.path.startsWith('/api/a/sm/audit')) {
						if (req.user.isSuperAdmin || hasCUDPerm(req._highestPermission)) {
							return res.json(body);
						} else if (highestPermission && e.hasAnyReadPermission(highestPermission)) {
							let newBody = null;
							if (Array.isArray(body)) {
								newBody = body.map(obj => {
									obj.data.new = obj.data.new ? e.filterBody(highestPermission, ['R'], obj.data.new) : null;
									obj.data.old = obj.data.old ? e.filterBody(highestPermission, ['R'], obj.data.old) : null;
									return obj;
								});
							} else {
								newBody = JSON.parse(JSON.stringify(body));
								newBody.data.new = body.data.new ? e.filterBody(highestPermission, ['R'], body.data.new) : null;
								newBody.data.old = body.data.old ? e.filterBody(highestPermission, ['R'], body.data.old) : null;
							}
							return res.json(newBody);
						} else {
							return res.status(403).json({ 'message': 'No permission' });
						}
					} else if (urlArr[5] && (urlArr[5] == 'logs' || urlArr[5] == 'webHookStatus')) {
						if (req.user.isSuperAdmin || (highestPermission && e.hasAnyReadPermission(highestPermission))) {
							return res.json(body);
						} else {
							return res.status(403).json({ 'message': 'No permission' });
						}
					} else {
						if (res.statusCode < 200 || res.statusCode >= 400) {
							return res.send(body);
						}
						let promise = null;
						if (isAppCenter) {
							let app = splitPath[3];
							promise = getSecuredFields(splitPath[3], splitPath[4], req)
								.then(secureFields => {
									return secureFields.reduce((acc, curr) => {
										return acc.then(_d => Array.isArray(_d) ? decryptArrData(_d, curr, app) : decryptData(_d, curr, app));
									}, Promise.resolve(body));
								});
						} else {
							promise = Promise.resolve(body);
						}
						promise.then((_d) => {
							body = JSON.parse(JSON.stringify(_d));
							if (req.user.isSuperAdmin || hasCUDPerm(req._highestPermission)) {
								return res.json(body);
							}
							let output = manipulateBody(body, req);
							return res.json(output);
						})
							.catch(err => {
								res.status(500).json({ message: err.message });
							});

					}*/
				}
			}, (err) => {
				res.status(403).json({ message: err.message });
				return;
			});

	};
};

let tag = ["__", "__"];

function getPosition(string, subString, index) {
	return string.split(subString, index).join(subString).length;
}

function fixEnrichedFilter(filter) {
	let newFilter = {};
	if (filter && filter.constructor == {}.constructor) {
		Object.keys(filter).forEach(_k => {
			if (_k == "$eq" && Array.isArray(filter[_k])) {
				newFilter["$in"] = [].concat.apply([], filter[_k]);
			} else if (_k == "$ne" && Array.isArray(filter[_k])) {
				newFilter["$nin"] = [].concat.apply([], filter[_k]);
			} else if (filter[_k] && filter[_k].constructor == {}.constructor && filter[_k]["#date"]) {
				newFilter[_k] = new Date(filter[_k]["#date"]);
			} else if (_k == "$exists" && Array.isArray(filter[_k])) {
				newFilter[_k] = [].concat.apply([], filter[_k]).some(_d => _d);
			}
			else {
				newFilter[_k] = fixEnrichedFilter(filter[_k]);
			}
		});
		return newFilter;
	}
	else if (filter && Array.isArray(filter)) {
		return filter.map(_f => fixEnrichedFilter(_f));
	}
	return filter;
}

function render(template, user, prev) {
	if (!template) {
		return "";
	} else {
		var tokenStartIndex = getPosition(template, tag[0], 1),
			tokenEndIndex = getPosition(template, tag[1], 2);
		if (tokenStartIndex >= 0 && tokenEndIndex > tokenStartIndex) {
			var token = template.substring(tokenStartIndex + tag[0].length, tokenEndIndex);
			let nextStr = render(template.substring(tokenEndIndex + tag[1].length), user, prev);
			let tokenVal = getTokenValue(token, user, prev);
			// console.log({user});
			if (tokenVal == undefined) {
				logger.error("Error in filter:: " + template);
				logger.error("value of " + token + " is undefined");
				logger.debug(JSON.stringify({ user }));
				logger.debug(JSON.stringify({ prev }));
				return JSON.stringify({ _id: null });
				// throw new Error('Somethig went wrong with rule setup');
			}
			let tokenString = null;
			if (Array.isArray(tokenVal)) {
				tokenString = `${JSON.stringify(tokenVal)}`;
				// tokenString = tokenString.substr(0, tokenString.length - 1)
			}
			// else tokenString = '"' + tokenVal + '"';
			//Boolean and number not working - jugnu - DEF1941
			else {
				if (typeof tokenVal == "boolean" || typeof tokenVal == "number") {
					tokenString = tokenVal;
				} else {
					tokenString = "\"" + tokenVal + "\"";
				}
			}
			// logger.info('UBAC Token Value', tokenString);
			return (`${template.substring(0, tokenStartIndex - 1)}${tokenString}${nextStr.substr(1)}`);
		} else {
			return template;
		}
	}
}

function getKeyValue(obj, key) {
	if (key.length == 0 || obj == null || obj == undefined) return obj;
	let nKey = key.shift();
	if (Array.isArray(obj)) {
		let a = obj.map(_o => getKeyValue(_o[nKey], key));
		return [].concat.apply([], a);
	} else {
		return getKeyValue(obj[nKey], key);
	}
}

function getTokenValue(token, user, prev) {
	let keyArr = token.split(".");
	let objName = keyArr.shift();
	let obj = objName == "#USER" ? user : prev;
	return getKeyValue(obj, keyArr);
}


e.checkRecordPermissionUtil = function (ruleArr, loggedinUser, type, returnFilter) {
	let prevCollection = null;
	let prevDB = null;
	return ruleArr.reduce((acc, curr, i) => {
		return acc.then(_prev => {
			logger.debug(JSON.stringify({ _prev }));
			if (curr.type == "Condition") {
				let enrichedFilter = render(curr.filter, loggedinUser, _prev);
				logger.debug(JSON.stringify({ oldenrichedFilter: enrichedFilter }));
				let newEnrichedFilter = fixEnrichedFilter(JSON.parse(enrichedFilter));
				logger.debug(JSON.stringify({ newEnrichedFilter }));
				prevCollection = curr.collection;
				prevDB = curr.db;
				let conditionPromise = curr.db.collection(curr.collection).find(newEnrichedFilter).toArray();
				if (i == ruleArr.length - 1) {
					if (returnFilter) {
						return Promise.resolve(newEnrichedFilter);
					}
					let returnKey = type == "filemapper" ? "__sNo" : "_id";
					return conditionPromise
						.then(_d => _d.map(_o => _o[returnKey]));
				}
				return conditionPromise;
			} else if (curr.type == "Traverse") {
				let graphObj = {
					from: curr.collection,
					startWith: `$${curr.startsWith}`,
					connectFromField: curr.fromField,
					connectToField: curr.toField,
					// maxDepth: curr.level == -1 ? undefined : curr.level,
					as: "output"
				};
				if (curr.level != -1) graphObj.maxDepth = curr.level;
				let aggQuery = [
					{ $match: { _id: { $in: _prev.map(_d => _d._id) } } },
					{
						$graphLookup: graphObj
					},
					{ $unwind: "$output" },
				];
				return prevDB.collection(prevCollection).aggregate(aggQuery)
					.toArray()
					.then(_out => {
						return _out.map(_d => _d.output);
					});
			}
		});
	}, Promise.resolve([]));
};

function modifyFilterForWF(filter, prefix) {
	let newFilter = {};
	if (filter.constructor != {}.constructor) return filter;
	Object.keys(filter).forEach(_k => {
		let newKey = _k.startsWith("$") ? _k : (prefix + _k);
		if (filter[_k].constructor == {}.constructor) {
			newFilter[newKey] = modifyFilterForWF(filter[_k], prefix);
		} else if (Array.isArray(filter[_k])) {
			newFilter[newKey] = filter[_k].map(_d => modifyFilterForWF(_d, prefix));
		}
		else {
			newFilter[newKey] = filter[_k];
		}
	});
	return newFilter;
}

function getdbAndCollection(serviceids) {
	return global.mongoConnectionAuthor.collection("services").find({ _id: { $in: serviceids } }).toArray()
		.then(_services => {
			let result = {};
			_services.forEach(_s => {
				result[_s._id] = {
					db: `${config.odpNS}-${_s.app}`,
					collection: _s.collectionName
				};
			});
			return result;
		});
}

function modifyAppcenterRequest(req, validIds, creationIds) {
	if ((e.compareUrl("/api/c/{app}/{api}/", req.path) || e.compareUrl("/api/c/{app}/{api}/utils/count", req.path) || e.compareUrl("/api/c/{app}/{api}/utils/export", req.path)) && req.method == "GET") {
		let customFilter = {
			"$and": [{ "$or": validIds }]
		};
		if (req.query.filter) {
			let oldFilter = req.query.filter;
			customFilter["$and"].push(typeof oldFilter === "object" ? oldFilter : JSON.parse(oldFilter));
		}
		req.query.filter = JSON.stringify(customFilter);
		logger.debug("Updated filter " + req.query.filter);
	}
	else if (e.compareUrl("/api/c/{app}/{api}/utils/aggregate", req.path)) {
		if (req.body) {
			let matchEle = { "$match": { $or: validIds } };
			if (Array.isArray(req.body)) {
				req.body.unshift(matchEle);
			} else {
				req.body = [matchEle, req.body];
			}
		}
		logger.debug("Updated body " + JSON.stringify(req.body));
	}
	else if (e.compareUrl("/api/c/{app}/{api}/", req.path) && req.method == "POST") {
		if (!creationIds.every(_cId => validIds.indexOf(_cId) > -1)) {
			throwError("Insufficient user privilege", 403);
		}
	}
	else if (e.compareUrl("/api/c/{app}/{api}/utils/bulkShow", req.path) && req.method == "GET") {
		let requestedIds = req.query.id.split(",");
		let newIds = requestedIds.filter(_d => validIds.indexOf(_d) > -1);
		req.query.id = newIds.join(",");
	}
	else if (e.compareUrl("/api/c/{app}/{api}/utils/bulkDelete", req.path) && req.method == "DELETE") {
		let requestedIds = req.body.ids;
		if (!requestedIds) return;
		req.body.ids = requestedIds.filter(_d => validIds.indexOf(_d) > -1);
	}
	else if (e.compareUrl("/api/c/{app}/{api}/{id}", req.path) && ["GET", "PUT", "DELETE"].indexOf(req.method) > -1) {
		let pathSplit = req.path.split("/");
		let requestedId = pathSplit[5];
		if (validIds.indexOf(requestedId) == -1) {
			throwError("Insufficient user privilege", 403);
		}
	}
}

function getserviceIdListWF(filter) {
	return global.mongoConnectionAuthor.collection("workflow").distinct("serviceId", filter);
}

function getWFIdList(filter, method, returnFilter, req) {
	return getserviceIdListWF(filter)
		.then(_serviceIds => {
			return e.getPermissions(req, _serviceIds, null, null);
		})
		.then(_permissions => {
			let promises = _permissions.map(_perm => {
				if (req.user.roles && Array.isArray(req.user.roles)) {
					let userPermissionIds = req.user.roles.filter(_r => _r.app === _perm.app && _r.entity === _perm.entity).map(_o => _o.id);
					return getPermittedIds(userPermissionIds, _perm, method, returnFilter, req);
				}
				else throwError("Something went wrong with user roles", 500);
			});
			return Promise.all(promises);
		})
		.then(_allowedIdsArr => {
			logger.debug(JSON.stringify({ _allowedIdsArr }));
			return [].concat.apply([], _allowedIdsArr);
		});
}

e.checkRecordPermissionForUserWF = function (req) {
	if (req.user.isSuperAdmin) return Promise.resolve();
	let pathSegment = req.path.split("/");
	let apiList = ["/api/a/workflow/serviceList", "/api/a/workflow", "/api/a/workflow/count", "/api/a/workflow/group/{app}"];
	if (apiList.some(_a => e.compareUrl(_a, req.path)) && req.method == "GET") {
		let filter = {};
		if (req.query.filter)
			filter = typeof req.query.filter == "string" ? JSON.parse(req.query.filter) : req.query.filter;
		return getWFIdList(filter, "REVIEW_READ", true, req)
			.then(allowedIds => {
				if (allowedIds) {
					if (req.query.filter) {
						let oldFilter = req.query.filter;
						let newFilter = { $and: [] };
						if (allowedIds.length > 0) newFilter["$and"].push({ $or: allowedIds });
						newFilter["$and"].push(typeof oldFilter === "object" ? oldFilter : JSON.parse(oldFilter));
						req.query.filter = JSON.stringify(newFilter);
						// req.query.filter = JSON.stringify({ '$and': [typeof oldFilter === 'object' ? oldFilter : JSON.parse(oldFilter), { _id: { '$in': allowedIds } }] });
					} else {
						// req.query.filter = JSON.stringify({ _id: { '$in': allowedIds } });
						if (allowedIds.length > 0) req.query.filter = JSON.stringify({ $and: allowedIds });
					}
				}
			});
	}
	if (e.compareUrl("/api/a/workflow/action", req.path)) {
		if (!req.body.ids || !Array.isArray(req.body.ids)) throwError("request does not contains id list", 500);
		let filter = { _id: { $in: req.body.ids } };
		return getWFIdList(filter, "REVIEW", false, req)
			.then(_allowedIds => {
				if (req.body.ids && _.difference(req.body.ids, _allowedIds).length > 0) {
					throwError("Insufficient privileges", 403);
				}
			});
	}
	if (e.compareUrl("/api/a/workflow/{id}", req.path) || e.compareUrl("/api/a/workflow/doc/{id}", req.path)) {
		let reqId = e.compareUrl("/api/a/workflow/{id}", req.path) ? pathSegment[4] : pathSegment[5];
		let filter = { _id: reqId };
		return getWFIdList(filter, (req.method === "GET" ? "REVIEW_READ" : "REVIEW_MANAGE"), false, req)
			.then(_allowedIds => {
				if (_allowedIds.indexOf(reqId) == -1) {
					throwError("Insufficient privileges", 403);
				}
			});
	}
	return Promise.resolve();
};

function getPermittedIds(userPermission, allPermission, method, returnFilter, req) {
	let ruleSets = [];
	let involvedServiceIds = [];
	allPermission.roles.forEach(_role => {
		let userHasPermissionFlag = userPermission.indexOf(_role.id) > -1;
		if (!userHasPermissionFlag) return;
		let opertionFlag = _role.operations.some(_o => {
			let methodFlag = false;
			if (method == "REVIEW_READ") methodFlag = ["GET", "PUT", "POST", "DELETE", "REVIEW"].indexOf(_o.method) > -1;
			else if (method == "REVIEW_MANAGE") methodFlag = ["PUT", "POST", "DELETE", "REVIEW"].indexOf(_o.method) > -1;
			else _o.method == method;
			return methodFlag;
		});
		if (opertionFlag) {
			if (Array.isArray(_role.rule) && _role.rule.length > 0) {
				ruleSets.push(_role.rule);
				_role.rule.forEach(_r => {
					if (_r.dataService) involvedServiceIds.push(_r.dataService);
				});
			}
		}
		// _role.operations.forEach(_o => {
		//     let methodFlag = false;
		//     if (method == 'REVIEW_READ') methodFlag = ['GET', 'PUT', 'POST', 'DELETE', 'REVIEW'].indexOf(_o.method) > -1;
		//     else if (method == 'REVIEW_MANAGE') methodFlag = ['PUT', 'POST', 'DELETE', 'REVIEW'].indexOf(_o.method) > -1;
		//     else _o.method == method;
		//     if (methodFlag && Array.isArray(_role.rule) && _role.rule.length > 0) {
		//         ruleSets.push(_role.rule);
		//         _role.rule.forEach(_r => {
		//             if (_r.dataService) involvedServiceIds.push(_r.dataService);
		//         });
		//     }
		// });
	});
	logger.debug(JSON.stringify(ruleSets));
	if (ruleSets.length == 0) {
		logger.debug("No rule set found");
		if (returnFilter) return Promise.resolve([{ serviceId: allPermission.entity }]);
		return global.mongoConnectionAuthor.collection("workflow").find({ serviceId: allPermission.entity }, { _id: 1 }).toArray()
			.then(_wf => _wf.map(_d => _d._id));
	}
	let collectionMapping = null;
	let allowedIds = [];
	return getdbAndCollection(involvedServiceIds)
		.then(_m => {
			collectionMapping = _m;
			let modifiedRuleSets = ruleSets.map((_rs) => {
				return _rs.map((_r, i) => {
					let newObj = JSON.parse(JSON.stringify(_r));
					newObj.db = global.appcenterDbo.db(collectionMapping[_r.dataService].db);
					newObj.collection = collectionMapping[_r.dataService].collection;
					if (i == _rs.length - 1) {
						newObj.collection = "workflow";
						newObj.db = global.mongoConnectionAuthor;
						let newDataFilter = modifyFilterForWF(JSON.parse(newObj.filter), "data.new.");
						let oldDataFilter = modifyFilterForWF(JSON.parse(newObj.filter), "data.old.");
						newObj.filter = JSON.stringify({ $or: [{ "$and": [{ "data.new": { "$ne": null } }, newDataFilter] }, { "$and": [{ "data.old": { "$ne": null } }, oldDataFilter] }] });
					}
					return newObj;
				});
			});
			return Promise.all(modifiedRuleSets.map(_rs => e.checkRecordPermissionUtil(_rs, req.user, "API", returnFilter)));
		})
		.then(_idsArr => {
			if (returnFilter) return _idsArr;
			allowedIds = [].concat.apply([], _idsArr);
			allowedIds = _.uniq(allowedIds);
			return allowedIds;
		});
}

e.checkRecordPermissionForUserCRUD = function (userPermission, allPermission, method, type, data, req) {
	let ruleSets = [];
	let involvedServiceIds = [];
	let currentServiceId = null;
	allPermission.roles.forEach(_role => {
		let userHasPermissionFlag = userPermission.indexOf(_role.id) > -1;
		if (!userHasPermissionFlag) return;
		_role.operations.forEach(_o => {
			if (_o.method == method && Array.isArray(_role.rule) && _role.rule.length > 0) {
				ruleSets.push(_role.rule);
				_role.rule.forEach(_r => {
					if (_r.dataService) involvedServiceIds.push(_r.dataService);
				});
				currentServiceId = _role.rule[_role.rule.length - 1].dataService;
			}
		});
	});
	if (ruleSets.length == 0) return Promise.resolve();
	let collectionMapping = null;
	let allowedIds = [];
	let creationIds = [];
	let currentCollection = null;
	let currentDBName = null;
	let returnFilter = false;
	let filterAPIs = ["/api/c/{app}/{api}/", "/api/c/{app}/{api}/utils/count", "/api/c/{app}/{api}/utils/export"];
	let isCreationAPI = req.method === "POST" && !e.compareUrl("/api/c/{app}/{api}/utils/aggregate", req.path);
	if (type == "API" && filterAPIs.some(_url => (e.compareUrl(_url, req.path) && req.method == "GET") || e.compareUrl("/api/c/{app}/{api}/utils/aggregate", req.path))) returnFilter = true;
	return getdbAndCollection(involvedServiceIds)
		.then(_m => {
			collectionMapping = _m;
			currentCollection = collectionMapping[currentServiceId].collection;
			currentDBName = collectionMapping[currentServiceId].db;
			if (isCreationAPI) {
				let stagedData = [];
				if (Array.isArray(data)) {
					stagedData = data.map(_d => {
						let newData = JSON.parse(JSON.stringify(_d));
						if (!_d._id) {
							newData._id = uuid();
						}
						creationIds.push(newData._id);
						return newData;
					});
				}
				else {
					let newData = JSON.parse(JSON.stringify(data));
					if (!newData._id) {
						newData._id = uuid();
					}
					creationIds.push(newData._id);
					stagedData.push(newData);
				}
				return global.appcenterDbo.db(currentDBName).collection(`${currentCollection}.staged`).insert(stagedData);
			}
			else return Promise.resolve();
		})
		.then(() => {
			let modifiedRuleSets = ruleSets.map(_rs => {
				return _rs.map((_r, i) => {
					let newObj = JSON.parse(JSON.stringify(_r));
					newObj.db = global.appcenterDbo.db(collectionMapping[_r.dataService].db);
					newObj.collection = collectionMapping[_r.dataService].collection;
					if (i == _rs.length - 1) {
						if (method == "POST") newObj.collection += ".staged";
					}
					return newObj;
				});
			});
			return Promise.all(modifiedRuleSets.map(_rs => this.checkRecordPermissionUtil(_rs, req.user, type, returnFilter)));
		})
		.then(_idsArr => {
			logger.debug(JSON.stringify({ _idsArr }));
			if (returnFilter) {
				return modifyAppcenterRequest(req, _idsArr, creationIds);
			}
			allowedIds = [].concat.apply([], _idsArr);
			allowedIds = _.uniq(allowedIds);
			logger.debug({ allowedIds });
			if (isCreationAPI) global.appcenterDbo.db(currentDBName).collection(`${currentCollection}.staged`).remove({ _id: { $in: creationIds } });
			return modifyAppcenterRequest(req, allowedIds, creationIds);
		})
		.then(() => allowedIds);
};

// e.checkRecordPermissionCRUD = function (userPermission, allPermission, method, apiType, req) {
//     let creationIds = [];
//     let promise = Promise.resolve();
//     if (method == 'POST') {
//         let stagedData = [];
//         if (Array.isArray(req.body)) {
//             stagedData = req.body.map(_d => {
//                 let newData = JSON.parse(JSON.stringify(req.body));
//                 if (!_d._id) {
//                     newData._id = uuid();
//                 }
//                 creationIds.push(newData._id);
//                 return newData;
//             });
//         }
//         else {
//             let newData = JSON.parse(JSON.stringify(req.body));
//             if (!newData._id) {
//                 newData._id = uuid();
//             }
//             creationIds.push(newData._id);
//             stagedData.push(newData);
//         }
//         promise = global.appcenterDbo.db(currentDBName).collection(`${currentCollection}.staged`).insert(stagedData);
//     }
//     return promise
//         .then(() => getRecordPermittedForUser(userPermission, allPermission, method, apiType, req))
//         .then((allowedIds) => modifyAppcenterRequest(req, allowedIds, creationIds))
// }

e.computeMethodAllowed = function (allowedPermission, allPermission, isAdminUser) {
	if (!allPermission.roles) throw new Error("Roles are not configured for the data service");
	let filteredRoles = allPermission.roles.filter(_r => allowedPermission.indexOf(_r.id) > -1);
	let skipRole = filteredRoles.find(_e => _e.operations.find(_o => _o.method === "SKIP_REVIEW"));
	let roles = isAdminUser || skipRole ? allPermission.roles : filteredRoles;
	let operationsObj = [];
	roles.forEach(_r => {
		_r.operations.forEach(_o => {
			if (_o.method !== "SKIP_REVIEW") {
				let methodFound = operationsObj.find(_oo => _oo.method === _o.method);
				if (methodFound) {
					methodFound.roleIds.push(_r.id);
				} else {
					operationsObj.push({ method: _o.method, workflowRoles: [], roleIds: [_r.id] });
				}
				// operationsName.push(_o.method);
			}
		});
	});

	if (skipRole) operationsObj.push({ method: "SKIP_REVIEW", workflowRoles: [] });
	// if (skipRole) operationsName.push('SKIP_REVIEW');
	// operationsName = _.uniq(operationsName);
	// let operationsObj = operationsName.map(_n => {
	//     return {
	//         method: _n, workflowRoles: []
	//     };
	// });
	operationsObj.forEach(_oo => {
		if (_oo.roleIds) {
			_oo.fields = e.getHighestPermission(allPermission.fields, _oo.roleIds, isAdminUser);
		}
	});
	allPermission.roles.forEach(_r => {
		_r.operations.forEach(_o => {
			let mObj = operationsObj.find(_obj => _obj.method === _o.method);
			if (mObj) {
				if (_o.workflowRoles && Array.isArray(_o.workflowRoles)) {
					mObj.workflowRoles = mObj.workflowRoles.concat(_o.workflowRoles);
				}
			}
		});
	});
	let getObj = operationsObj.find(o => o.method === "GET");
	if (getObj)
		getObj.fields = e.getHighestPermission(allPermission.fields, allowedPermission, isAdminUser);
	operationsObj.push({
		method: "GET",
		fields: e.getHighestPermission(allPermission.fields, allowedPermission, isAdminUser)
	});
	return operationsObj;
};

e.highestPermissionHandlerCurrentUser = (req, res) => {
	let perm = [];
	// To fetch all the permission id the user has for a app and entity.
	if (req.user.roles && Array.isArray(req.user.roles)) {
		perm = req.user.roles.filter(_r => (req.query.app ? _r.app === req.query.app : true) && _r.entity === req.query.entity).map(_o => _o.id);
		// perm = [].concat.apply([], req.user.roles.filter(_r => (req.query.app ? _r.app === req.query.app : true) && _r.permissions && Array.isArray(_r.permissions)).map(obj => obj.permissions.map(_p => _p.name)));
	}
	e.getPermissions(req, req.query.entity, req.query.app)
		.then(_p => {
			let allPermission = _p[0];
			if (!allPermission) {
				res.status(400).send({ message: "permission not found" });
			} else {
				allPermission.fields = JSON.parse(allPermission.fields);
				let isAdminUser = req.user && req.user.isSuperAdmin ? true : false;
				let highestPermission = e.computeMethodAllowed(perm, allPermission, isAdminUser);
				// let highestPermission = e.getHighestPermission(allPermission.fields, perm);
				res.send(highestPermission);
			}
		})
		.catch(err => {
			logger.error(err);
			res.status(500).send({
				message: err.message
			});
		});
};

let getGroupOrUserDetails = (_req, id, type) => {
	let url = type === "user" ? config.get("user") + `/rbac/usr/${id}/allRoles` : config.get("user") + "/rbac/group/" + id;
	var options = {
		url: url,
		method: "GET",
		headers: {
			"Content-Type": "application/json",
			"TxnId": _req.get("txnId") ? _req.get("txnId") : gwUtil.getTxnId(_req),
			"Authorization": _req.get("Authorization"),
			"User": _req.user ? _req.user._id : null
		}
	};
	return new Promise((resolve, reject) => {
		request.get(options, function (err, res) {
			if (err) {
				logger.error(err.message);
				reject(err);
			} else if (!res) {
				logger.error("User Manager DOWN");
				reject(new Error("User Manager DOWN"));
			} else {
				if (res.statusCode >= 200 && res.statusCode < 400)
					resolve(JSON.parse(res.body));
				else {
					resolve();
				}
			}
		});
	});
};

e.highestPermissionHandlerGroup = (req, res) => {
	let groupId = req.query.id;
	let perm = [];
	return getGroupOrUserDetails(req, groupId, "group")
		.then(grpDetail => {
			if (grpDetail) {
				if (grpDetail.roles && Array.isArray(grpDetail.roles)) {
					// To fetch all the permission id the user has for a app and entity.
					perm = grpDetail.roles.filter(_r => (req.query.app ? _r.app === req.query.app : true) && _r.entity === req.query.entity).map(_o => _o.id);
				}
				return e.getPermissions(req, req.query.entity, req.query.app);
			} else {
				res.status(404).json({ message: "Group not found" });
			}
		})
		.then(_p => {
			if (_p) {
				let allPermission = _p[0];
				if (!allPermission) {
					res.status(400).send({ message: "permission not found" });
				} else {
					allPermission.fields = JSON.parse(allPermission.fields);
					let highestPermission = e.computeMethodAllowed(perm, allPermission, false);
					res.send(highestPermission);
				}
			}
		})
		.catch(err => {
			logger.error(err);
			res.status(500).send({
				message: err.message
			});
		});
};

e.highestPermissionHandlerUser = (req, res) => {
	let userId = req.query.id;
	let perm = [];
	return getGroupOrUserDetails(req, userId, "user")
		.then(usrDetail => {
			if (usrDetail) {
				if (usrDetail.roles && Array.isArray(usrDetail.roles)) {
					// To fetch all the permission id the user has for a app and entity.
					perm = usrDetail.roles.filter(_r => (req.query.app ? _r.app === req.query.app : true) && _r.entity === req.query.entity).map(_o => _o.id);
				}
				return e.getPermissions(req, req.query.entity, req.query.app);
			} else {
				res.status(404).json({ message: "User not found" });
			}
		})
		.then(_p => {
			if (_p) {
				let allPermission = _p[0];
				if (!allPermission) {
					res.status(400).send({ message: "permission not found" });
				} else {
					allPermission.fields = JSON.parse(allPermission.fields);
					let highestPermission = e.computeMethodAllowed(perm, allPermission, false);
					res.send(highestPermission);
				}
			}
		})
		.catch(err => {
			logger.error(err);
			res.status(500).send({
				message: err.message
			});
		});
};

let getWorkFlows = (_req, entityList, app, filter) => {
	var options = {
		url: config.get("wf") + "/workflow/group/" + app,
		method: "GET",
		headers: {
			"Content-Type": "application/json",
			"TxnId": _req.get("txnId") ? _req.get("txnId") : gwUtil.getTxnId(_req),
			"Authorization": _req.get("Authorization"),
			"User": _req.user ? _req.user._id : null
		},
		qs: {
			entity: entityList
		}
	};
	if (filter) {
		options.qs.filter = filter;
	}
	return new Promise((resolve, reject) => {
		request.get(options, function (err, res) {
			if (err) {
				logger.error(err.message);
				reject(err);
			} else if (!res) {
				logger.error("Workflow Service DOWN");
				reject(new Error("Workflow Service DOWN"));
			} else {
				if (res.statusCode >= 200 && res.statusCode < 400)
					resolve(JSON.parse(res.body));
			}
		});
	});
};

e.workFlowCalculator = (req, res) => {
	let services = [];
	let filter = req.query.filter;
	filter = typeof filter === "string" ? JSON.parse(filter) : filter;
	// let permFilter = null;
	// if (filter && filter.serviceId) {
	//     permFilter = { entity: filter.serviceId };
	// }
	// console.log(req.user.roles);
	e.getPermissions(req, (filter && filter.serviceId) ? filter.serviceId : null, req.query.app)
		.then(_p => {
			_p = _p.filter(_a => _a.roles && _a.fields);
			_p.forEach(doc => {
				let perm = [];
				// To fetch all the permission id the user has for a app and entity.
				if (req.user.roles && Array.isArray(req.user.roles)) {
					perm = req.user.roles.filter(_r => _r.app === doc.app && _r.entity === doc.entity).map(_o => _o.id);
				}
				doc.fields = JSON.parse(doc.fields);
				let isAdminUser = req.user && req.user.isSuperAdmin ? true : false;
				let highestPermission = e.computeMethodAllowed(perm, doc, isAdminUser);
				if (hasApproveViewPerm(highestPermission)) {
					services.push(doc.entity);
				}
			});
			return services;
		})
		.then(_s => {
			return getWorkFlows(req, _s.join(","), req.query.app, filter);
		})
		.then(_wf => {
			res.json(_wf);
		})
		.catch(err => {
			logger.error(err);
			res.status(500).json({ message: err.message });
		});
};


e.workflowServiceList = async (req, res) => {
	try {
		const app = req.params.app;
		const filter = req.query.filter;
		let services = [];
		services = await httpRequest({
			url: config.get("sm") + "/sm/service",
			method: "GET",
			headers: {
				"Content-Type": "application/json",
				"TxnId": req.get("TxnId"),
			},
			qs: {
				select: "name,api,app",
				filter: JSON.stringify({ app }),
				count: -1
			},
			json: true
		});
		const docsPromise = services.map((e) => {
			return new Promise((resolve) => {
				const url = "http://" + e.api.split("/")[1] + "." + config.odpNS + "-" + e.app.toLowerCase().replace(/ /g, "") + "/" + e.app + e.api + "/utils/workflow/serviceList";
				httpRequest({
					url,
					method: "GET",
					headers: {
						"Content-Type": "application/json",
						"TxnId": req.get("TxnId"),
					},
					qs: {
						filter: filter,
					},
					json: true
				}).then(data => {
					resolve(data);
				}).catch(err => {
					logger.error(`[${req.get("TxnId")}] Error from ${e.name}`);
					logger.error(err);
					resolve({});
				});
			});
		});
		services = await Promise.all(docsPromise);
		services = Object.assign.apply({}, services);
		res.status(200).json(services);
	} catch (err) {
		logger.error(`[${req.get("TxnId")}] Error from Service Manager`);
		logger.error(err);
		res.status(500).json({ message: err.message });
	}
};


module.exports = e;



function httpRequest(options) {
	return new Promise((resolve, reject) => {
		request(options, function (err, res, body) {
			if (err) {
				reject(err);
			} else if (!res) {
				reject(new Error("Module is DOWN"));
			} else {
				if (res.statusCode >= 200 && res.statusCode < 400) {
					return resolve(body);
				} else {
					return reject(new Error(res.body.message ? res.body.message : "Unable fetch data"));
				}
			}
		});
	});
}