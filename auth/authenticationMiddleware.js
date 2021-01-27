const request = require("request-promise")
const userManagementCache = require('@appveen/utils').cache;
const config = require("../config/config")
const cacheUtil = require("../util/cacheUtil")
const gwUtil = require("../util/gwUtil")
const mongo = require("../util/mongoUtils")

const diagnosticAPIHandler = require("../routes/diag.route").e.diagnosticHandler

const logger = global.logger

let e = {};

function getRolesAggregationPipeLine(_id) {
	return [{ '$match': { 'users': _id } }, 
	{ '$project': { 'roles': 1 } }, 
	{
		'$unwind': {
			'path': '$roles', 
			'preserveNullAndEmptyArrays': false
		}
	}, {
		'$group': {
			'_id': null, 
			'roles': {
				'$addToSet': '$roles'
			}
		}
	}];
}

async function validateJWT(_req) {
	let token = _req.get("Authorization") || _req.cookies.Authorization
	let promise = Promise.resolve()
	if (_req.get("Cache")) {
		let dataFromCache = await cacheUtil.getCachedValidateJWT(_req.get("Cache"), _req.tokenHash)
		if(dataFromCache) {
			logger.debug(`[${_req.headers.TxnId}] Data fetched from internal cache`)
			return _d
		}
	}
	logger.debug(`[${_req.headers.TxnId}] Fetching ${_req.user._id} details from DB`)
	return userManagementCache.isBlacklistedToken(_req.tokenHash)
	.then(_flag => _flag ? Promise.reject(new Error("Token Blacklisted")) : userManagementCache.isValidToken(_req.tokenHash))
	.then(_flag => _flag ? _flag : Promise.reject(new Error("Invalid Token")))
	.then(() => mongo.findOne(false, "userMgmt.users", { '_id': _req.user._id, 'isActive': true }, null))
	.then(_user => _req.user = _user)
	.then(() => cacheUtil.getApp(_req.user.isSuperAdmin, _req.tokenHash))
	.then(_apps => _req.user.apps = _apps)
	.then(() => mongo.aggregate(false, "userMgmt.groups", getRolesAggregationPipeLine(_req.user._id)))
	.then(_roles => _req.user.roles = _roles[0] ? _roles[0].roles : [])
	.then(() => logger.trace(`Validate body: ${JSON.stringify(_req.user)}`))
	.catch(_error => {
		logger.error(_error)
		throw 'Unauthorized'
	});
}

// e.validateSocketJWT = (url, token) => {
// 	var options = {
// 		url: url,
// 		method: "GET",
// 		headers: {
// 			"Content-Type": "application/json",
// 			"Authorization": token
// 		},
// 		json: true
// 	}
// 	return new Promise((resolve, reject) => {
// 		request.get(options, function (err, res, body) {
// 			if (err) {
// 				reject(err)
// 			} else if (!res) {
// 				reject(new Error("User management service Down"))
// 			} else {
// 				if (res.statusCode == 200) resolve(body)
// 				else {
// 					reject(new Error(JSON.stringify(body)))
// 				}
// 			}
// 		})
// 	})
// }

e.authN = async (_req, _res, _next) => {

	if (gwUtil.isPermittedURL(_req)) return _next()

	logger.debug(`[${_req.headers.TxnId}] Requested URL - ${_req.path} - needs AuthN check!`)
	
	let isDownloadUrl = gwUtil.isDownloadURL(_req)
	logger.debug(`[${_req.headers.TxnId}] Requested URL - ${_req.path} - will download/export a file? ${isDownloadUrl}`)
	
	let urlsplit = _req.path.split("/")
	if ((urlsplit[5] == "export" && urlsplit[6] == "download") || (urlsplit[5] == "file" && urlsplit[6] == "download")) isDownloadUrl = true
	
	try {
		await validateJWT(_req)
		if (!_req.user.roles) _req.user.roles = []
		return _next()
	} catch (_error) {
		logger.error(_error)
		if(_error == '500') return _res.status(500).end()
		if (gwUtil.compareUrl("/api/a/rbac/logout", _req.path)) return _res.status(200).json({ message: "Logged out successfully" })
		_res.status(401).json({ message: "Unauthorized" })
	}
}

e.diagnosticAPIHandler = (_req, _res, next) => {
	if (_req.path.startsWith("/api/a/gw/diag")) diagnosticAPIHandler(_req, _res)
	else next()
}

module.exports = e