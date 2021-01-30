'use strict'

const gwUtil = require("../util/gwUtil")
const urlConfig = require("../config/urlConfig")
const db = require("../util/mongoUtils")

let e = {};

async function getManageRoleServiceList(_req) {
	logger.debug(`[${_req.headers.TxnId}] _req.user.roles - ${JSON.stringify(_req.user.roles)}`)
	let serviceList = await db.getAppCenterDataServicesList(_req.user._id)
	serviceList = serviceList.entities
	logger.debug(`[${_req.headers.TxnId}] serviceList - ${serviceList}`)
	let manageServiceList = []
	logger.debug(`[${_req.headers.TxnId}] ${JSON.stringify({ serviceList })}`)
	return global.mongoConnectionAuthor.collection("userMgmt.roles").find({ _id: { $in: serviceList } }, { roles: 1, app: 1, entity: 1 }).toArray()
		.then(roles => {
			logger.debug(`[${_req.headers.TxnId}] ${JSON.stringify(roles)}`)
			roles.forEach(_r => {
				let manageIds = _r.roles.filter(_rr => _rr.operations && _rr.operations.find(_o => ["POST", "PUT", "DELETE", "REVIEW"].indexOf(_o.method) > -1)).map(_rr => _rr.id)
				logger.debug(`[${_req.headers.TxnId}] ${JSON.stringify({ manageIds })}`)
				if (manageIds && _req.user.roles.find(_rr => _rr.entity === _r.entity && manageIds.indexOf(_rr.id) > -1)) {
					manageServiceList.push(_r.entity)
				}
			})
			logger.debug(`[${_req.headers.TxnId}] ${JSON.stringify({ manageServiceList })}`)
			return manageServiceList
		})
}

e.addRequestDetails = async (_req, _res, next) => {
	logger.debug(`[${_req.headers.TxnId}] Add request details called!`)
	try {
		if (_req.path == "/api/a/pm/agentRegistry/IEG/password") return next()
		if (gwUtil.compareUrl("/api/a/workflow/serviceList", _req.path)) return next()

		logger.debug(`[${_req.headers.TxnId}] Add request detail`)
		
		if (_req.body) {
			delete _req.body._metadata
			delete _req.body.__v
		}

		let pathSplit = _req.path.split("/")
		logger.debug(`[${_req.headers.TxnId}] Path array :: ${pathSplit}`)
		let promise = Promise.resolve()
		
		if (_req.path.startsWith("/api/a/rbac/group")) {
			
			if (_req.method === "POST") {
				_req.apiDetails = _req.body
				let query = { _id: { $in: _req.apiDetails.users ? _req.apiDetails.users : [] } }
				let project = { bot: 1 }
				_req.apiDetails.usersDetail = await db.find(false, "userMgmt.users", query, project)
			}

			if (_req.method === "PUT" || _req.method === "DELETE") {
				let groupId = _req.path.split("/").pop()
				_req.apiDetails = await db.findOne(false, "userMgmt.groups", { _id: groupId }, null)
				let userList = (_req.body.users ? _req.body.users : []).concat(_req.apiDetails.users ? _req.apiDetails.users : [])
				_req.apiDetails.usersDetail = await db.find(false, "userMgmt.users", { _id: { $in: userList } }, { bot: 1 })
			}
			
			return next()
		}

		if (gwUtil.compareUrl("/api/a/rbac/usr/{usrId}/addToGroups", _req.path) || gwUtil.compareUrl("/api/a/rbac/usr/{usrId}/removeFromGroups", _req.path)) {
			let aggregateQuery = [
			  {
			    '$match': { '_id': { '$in': _req.body.groups } }
			  }, {
			    '$group': { '_id': '$app' }
			  }
			]
			let app = await db.aggregate(false, "userMgmt.groups", aggregateQuery)
			_req.apiDetails = { app : [app._id] }
			let user = await db.findOne(false, "userMgmt.users", { _id: pathSplit[5] }, {projection : {bot :1 }})
			_req.apiDetails.bot = user.bot
			return next()
		}

		if (
				( _req.path.startsWith("/api/a/rbac/usr") && _req.method === "PUT") || 
				gwUtil.compareUrl("/api/a/rbac/usr/{id}/allRoles", _req.path) || 
				( gwUtil.compareUrl("/api/a/rbac/usr/{id}/closeAllSessions", _req.path) && _req.method === "DELETE") || 
				gwUtil.compareUrl("/api/a/rbac/usr/{id}/reset", _req.path)
			) {
			
			if (gwUtil.compareUrl("/api/a/rbac/usr/{username}/{app}/import", _req.path)) {
				_req.apiDetails = await db.findOne(false, "userMgmt.users", { _id: pathSplit[5] }, null)
				return next()
			}

			_req.apiDetails = await db.findOne(false, "userMgmt.users", { _id: pathSplit[5] }, null)
			let aggregationResult = await db.getUserApps(pathSplit[5])
			_req.apiDetails.app = aggregationResult ? aggregationResult[0].apps : [];
			return next()
		}

		if (gwUtil.compareUrl("/api/a/rbac/bot/botKey/{_id}", _req.path)) {
			let aggregationResult = await db.getUserApps(pathSplit[6])
			_req.apiDetails.app = aggregationResult[0].apps
			return next()
		}
		
		if (gwUtil.compareUrl("/api/a/rbac/bot/botKey/session/{_id}", _req.path)) {
			let aggregationResult = await db.getUserApps(pathSplit[7])
			_req.apiDetails.app = aggregationResult[0].apps
			return next()
		}
		
		if (gwUtil.compareUrl("/api/a/rbac/{userType}/{_id}/status/{userState}", _req.path)) {
			let aggregationResult = await db.getUserApps(pathSplit[5])
			_req.apiDetails.app = aggregationResult ? aggregationResult[0].apps : []
			return next();
		}
		
		if (gwUtil.compareUrl("/api/a/sm/service/{Id}", _req.path) && _req.method === "PUT") {
			let ds = await db.findOne(false, "services", { _id: pathSplit[5] })
			if(ds.draftVersion) ds = await db.findOne(false, "services.draft" ,{ _id: pathSplit[5] })
			_req.apiDetails = ds
			_req.apiDetails.role = await db.findOne(false, "userMgmt.roles", { _id: pathSplit[5] })
			return next()
		}
		
		if (
				_req.path != "/api/a/pm/flow/count" && 
				!gwUtil.compareUrl("/api/a/pm/flow/{app}/stopAll", _req.path) && 
				!gwUtil.compareUrl("/api/a/pm/flow/{app}/startAll", _req.path) && 
				( gwUtil.compareUrl("/api/a/pm/flow/{id}", _req.path) || gwUtil.compareUrl("/api/a/pm/flow/{id}/{action}", _req.path) )
			) {
			let filter = { 
				"$or" : [
					{ _id: pathSplit[5] },
					{ "runningFlow": pathSplit[5] },
					{ "nextFlow": pathSplit[5] }
				]
			}
			let flows = await db.find(false, "b2b.flows", filter, { app: 1 })
			if (flows[0]) {
				_req.apiDetails = {
					app: flows[0].app,
					relatedFlows: flows.map(_f => _f._id)
				}
				return next()
			}
			return next(new Error("Flow not found"))
		}
		
		if (urlConfig.secret.partner.some(_url => gwUtil.compareUrl(_url, _req.path))) {
			let partner = await db.findOne(false, "b2b.partners", { _id: pathSplit[5] }, { projection: { app: 1 }})
			if (partner) {
				_req.apiDetails = { app: partner.app }
				return next()
			}
			return next(new Error(`Partner not found: ${pathSplit[5]}`))
		}
		
		if (_req.path != "/api/a/pm/nanoService/count" && gwUtil.compareUrl("/api/a/pm/nanoService/{id}", _req.path)) {
			let nanoService = await db.findOne(false, "b2b.nanoService", { _id: pathSplit[5] }, { projection: { app: 1 }})
			if (nanoService) {
				_req.apiDetails = nanoService
				return next()
			}
			return next(new Error(`Nanoservice not found: ${pathSplit[5]}`))
		}
		
		if (_req.path != "/api/a/pm/dataFormat/count" && gwUtil.compareUrl("/api/a/pm/dataFormat/{id}", _req.path)) {
			let dataFormat = await db.findOne(false, "dataFormat", { _id: pathSplit[5] }, { projection: { app: 1 }})
			if (dataFormat) {
				_req.apiDetails = dataFormat
				return next()
			}
			return next(new Error(`Dataformat not found: ${pathSplit[5]}`))
		}
		
		if (
			_req.path != "/api/a/pm/agentRegistry/count" && 
			gwUtil.compareUrl("/api/a/pm/agentRegistry/{id}", _req.path) || 
			gwUtil.compareUrl("/api/a/pm/agentRegistry/{id}/{action}", _req.path)
		) {
			let agentRegistry = await db.findOne(false, "b2b.agentRegistry", { _id: pathSplit[5] }, { projection: { app: 1 }})
			if (agentRegistry) {
				_req.apiDetails = agentRegistry
				return next()
			}
			return next(new Error(`Agent ${pathSplit[5]} not found in registry`))
		}
		
		if (gwUtil.compareUrl("/api/a/workflow/action", _req.path)) {
			const wfIds = _req.body.ids
			_req.apiDetails = await db.find(false, "workflow", { _id: { $in: wfIds } }, { projection: { serviceId: 1, app: 1 }})
			_req.apiDetails.manageServiceList = getManageRoleServiceList(_req)
			return next()
		}
		
		if (_req.path != "/api/a/workflow/count" && gwUtil.compareUrl("/api/a/workflow/{Id}", _req.path)) {
			promise = global.mongoConnectionAuthor.collection("workflow").findOne({ _id: pathSplit[4] }, { serviceId: 1, app: 1 })
				.then(wf => {
					if (wf) {
						_req.apiDetails = wf
						if (_req.method === "PUT") {
							return getManageRoleServiceList(_req)
								.then(_d => {
									_req.apiDetails.manageServiceList = _d
									return next()
								})
						}
						return next()
					} else {
						return next(new Error("Workflow not found"))
					}
				})
		}
		
		if (gwUtil.compareUrl("/api/a/workflow/doc/{Id}", _req.path)) {
			promise = global.mongoConnectionAuthor.collection("workflow").findOne({ _id: pathSplit[5] }, { serviceId: 1, app: 1 })
				.then(wf => {
					if (wf) {
						_req.apiDetails = wf
						return getManageRoleServiceList(_req)
							.then(_d => {
								_req.apiDetails.manageServiceList = _d
								return next()
							})
					} else {
						return next(new Error("Workflow not found"))
					}
				})
		}
		
		if (gwUtil.compareUrl("/api/a/mon/appCenter/{SRVC}/logs", _req.path) || gwUtil.compareUrl("/api/a/mon/appCenter/{SRVC}/logs/count", _req.path) || gwUtil.compareUrl("/api/a/mon/appCenter/{SRVC}/postHook", _req.path) || gwUtil.compareUrl("/api/a/mon/appCenter/{SRVC}/postHook/count", _req.path) || gwUtil.compareUrl("/api/a/mon/appCenter/{SRVC}/preHook", _req.path) || gwUtil.compareUrl("/api/a/mon/appCenter/{SRVC}/preHook/count", _req.path)) {
			_req.apiDetails = await db.findOne(false, "services", { _id: pathSplit[5] }, { projection: { app: 1 }})
			return next()
		}
		
		if (gwUtil.compareUrl("/api/a/mon/author/sm/audit", _req.path) || gwUtil.compareUrl("/api/a/mon/author/sm/audit/count", _req.path)) {
			let filter = JSON.parse(_req.query.filter)
			let srvcId = filter["data._id"]
			_req.apiDetails = await db.findOne(false, "services", { _id: srvcId }, { projection: { app: 1 }})
			return next()
		}

		logger.debug(`[${_req.headers.TxnId}] No request details needs to be set!`)
		return next()

	} catch (e) {
		logger.error(`[${_req.headers.TxnId}] ${e.message}`)
		return _res.status(500).json({ message: "Cannot find details of the request" })
	}
}

module.exports = e;


