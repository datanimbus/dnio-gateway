let authUtil = require("./../../util/authUtil");
let gwUtil = require("./../../util/gwUtil");
let commonAuthzMw = require("./common.authorizationMiddleware");

let logger = global.logger;
const NO_ACCESS_API = ["/api/a/rbac/role"]

function getRbacApp(_req) {
	let pathSegment = _req.path.split("/")
	if (_req.path.startsWith("/api/a/rbac/role")) {
		if (_req.method == "POST" || _req.method == "PUT") {
			return _req.body.app
		}
	}
	else if (authUtil.compareUrl("/api/a/rbac/app/{app}/removeUsers", _req.path) || authUtil.compareUrl("/api/a/rbac/app/{app}/removeBots", _req.path)) {
		return pathSegment[5]
	}
	else if (_req.path.startsWith("/api/a/rbac/app")) {
		if (_req.method == "PUT" || _req.method == "DELETE") {
			return _req.path.split("/").pop()
		}
		if (_req.method == "POST") {
			return _req.body._id
		}
	} else if (_req.path.startsWith("/api/a/rbac/group")) {
		return _req.apiDetails ? _req.apiDetails.app : null
	} else if (authUtil.compareUrl("/api/a/rbac/usr/{userId}/appAdmin/{action}", _req.path)) {
		return _req.body.apps
	}
	return null
}

function isUserAccessControlInvalid(_req) {
	let accessLevel = _req.user.accessControl.accessLevel
	let pathSegment = _req.path.split("/")
	if (_req.user.isSuperAdmin) return false
	if (_req.path == "/api/a/rbac/app" && (_req.method == "POST" || _req.method == "DELETE") && !_req.user.isSuperAdmin) {
		return true
	}
	if (accessLevel != "Selected") {
		if (NO_ACCESS_API.some(key => _req.path.startsWith(key)) && (_req.method == "POST" || _req.method == "DELETE" || _req.method == "PUT")) {
			return true
		}
	}
	let reqApp = getRbacApp(_req)
	let appsAllowed = []
	if (accessLevel == "Selected") {
		appsAllowed = _req.user.accessControl.apps ? _req.user.accessControl.apps.map(obj => obj._id) : []
	}
	if (authUtil.compareUrl("/api/a/rbac/app/{app}/bookmark", _req.path) || authUtil.compareUrl("/api/a/rbac/app/{app}/bookmark/count", _req.path)) {
		let permissionApp = []
		let allowedPermission = []
		let app = pathSegment[5]
		if (_req.method === "GET") {
			allowedPermission = ["PMBM", "PVBM"]
		} else if (_req.method === "POST") {
			allowedPermission = ["PMBM"]
		}
		permissionApp = _req.user.roles.filter(_r => (allowedPermission.indexOf(_r.id) > -1) && _r.entity === "BM").map(_r => _r.app)
		let appPermission = appsAllowed.concat(permissionApp).indexOf(app) == -1
		logger.debug(JSON.stringify({ appPermission, app }))
		if (!appPermission)
			return false
		if (_req.method === "GET") {
			let manageGroupApps = _req.user.roles.filter(_r => (_r.id === "PMGABM" || _r.id === "PVGABM" || _r.id === "PMGCBM" || _r.id === "PVGCBM") && _r.entity === "GROUP").map(_r => _r.app)
			let exceptionBM = _req.user.roles.filter(_r => (_r.id === "PMBM" || _r.id === "PVBM") && _r.entity.startsWith("BM_")).map(_r => _r.entity.substr(3))
			let customFilter = {
				"$and": [
					{
						$or: [
							{ app: { "$in": appsAllowed.concat(manageGroupApps) } },
							{
								$and: [
									{
										$or: [
											{ app: { $in: permissionApp } },
											{ _id: { $in: exceptionBM } }
										]
									}
								]
							}
						]
					}
				]
			}
			if (_req.query.filter) {
				let oldFilter = _req.query.filter
				customFilter["$and"].push(typeof oldFilter === "object" ? oldFilter : JSON.parse(oldFilter))
			}
			_req.query.filter = JSON.stringify(customFilter)
			if (appsAllowed.concat(permissionApp).length == 0 && exceptionBM.length === 0 && manageGroupApps.length > 0) {
				_req.query.select = "_id,name,app,_metadata"
			}
			return false
		}
		return true
	}
	if (authUtil.compareUrl("/api/a/rbac/app/{app}/bookmark/bulkDelete", _req.path) || authUtil.compareUrl("/api/a/rbac/app/{app}/bookmark/{id}", _req.path)) {
		let app = pathSegment[5]
		let permissionApp = []
		let allowedPermission = []
		if (_req.method === "GET") {
			allowedPermission = ["PMBM", "PVBM"]
		} else if (_req.method === "PUT" || _req.method === "DELETE") {
			allowedPermission = ["PMBM"]
		}
		permissionApp = _req.user.roles.filter(_r => (allowedPermission.indexOf(_r.id) > -1) && _r.entity === "BM").map(_r => _r.app)
		let appPermission = appsAllowed.concat(permissionApp).indexOf(app) == -1
		if (!appPermission) return false
		if (_req.method === "GET") {
			let manageGroupApps = _req.user.roles.filter(_r => (_r.id === "PMGABM" || _r.id === "PVGABM" || _r.id === "PMGCBM" || _r.id === "PVGCBM") && _r.entity === "GROUP").map(_r => _r.app)
			let exceptionBM = _req.user.roles.filter(_r => (_r.id === "PMBM" || _r.id === "PVBM") && _r.entity.startsWith("BM_")).map(_r => _r.entity.substr(3))
			if (appsAllowed.concat(permissionApp).length == 0 && exceptionBM.length === 0 && manageGroupApps.length > 0) {
				_req.query.select = "_id,name,app,_metadata"
			}
			return false
		}
		else if (_req.method === "PUT" || _req.method === "DELETE") {
			let exceptionBM = _req.user.roles.filter(_r => (_r.id === "PMBM") && _r.entity.startsWith("BM_")).map(_r => _r.entity.substr(3))
			return exceptionBM.indexOf(app) === -1
		}
		return true
	}
	if (_req.path.startsWith("/api/a/rbac/role") && (_req.method === "PUT" || _req.method === "POST" || _req.method === "DELETE")) {
		return true
	}
	if (authUtil.compareUrl("/api/a/rbac/usr", _req.path) && _req.path === "POST") {
		return !_req.user.isSuperAdmin
	}
	if (authUtil.compareUrl("/api/a/rbac/app/{app}/removeUsers", _req.path)) {
		let appAdminFlag = accessLevel == "Selected" && reqApp && (appsAllowed.indexOf(reqApp) > -1)
		let appsAllowedMU = _req.user.roles.filter(_r => _r.id === "PMUBD" && _r.entity === "USER").map(_r => _r.app)
		let userManageFlag = reqApp && (appsAllowedMU.indexOf(reqApp) > -1)
		if (_req.body && _req.body.userIds && (_req.body.userIds.indexOf(_req.user._id) > -1)) return true
		return !(appAdminFlag || userManageFlag)
	}
	if (authUtil.compareUrl("/api/a/rbac/app/{app}/removeBots", _req.path)) {
		let appAdminFlag = accessLevel == "Selected" && reqApp && (appsAllowed.indexOf(reqApp) > -1)
		let appsAllowedMB = _req.user.roles.filter(_r => _r.id === "PMBBD" && _r.entity === "USER").map(_r => _r.app)
		let botManageFlag = reqApp && (appsAllowedMB.indexOf(reqApp) > -1)
		return !(appAdminFlag || botManageFlag)
	}
	if (_req.path.startsWith("/api/a/rbac/app") && (_req.method === "DELETE" || _req.method === "POST")) {
		return true
	}
	if (_req.path.startsWith("/api/a/rbac/app") && _req.method === "PUT") {
		let appAdminFlag = accessLevel == "Selected" && reqApp && (appsAllowed.indexOf(reqApp) > -1)
		return !appAdminFlag
	}

	if (_req.path.startsWith("/api/a/rbac/group") && (_req.method === "PUT" || _req.method === "POST")) {
		let appAdminFlag = accessLevel == "Selected" && reqApp && (appsAllowed.indexOf(reqApp) > -1)
		if (appAdminFlag) return false
		if (_req.method === "POST") {
			let groupCreateFlag = _req.user && _req.user.roles && _req.user.roles.find(_r => _r.app === reqApp && _r.id == "PMGBC" && _r.entity === "GROUP")
			if (!groupCreateFlag) return true
			if (_req.body.roles && _req.body.roles.length > 0) {
				if (_req.body.users && (_req.body.users.indexOf(_req.user._id) > -1)) return true
				let rolesFlag = authUtil.validateRolesArray(_req.body.roles, _req.user.roles, "M")
				if (!rolesFlag) return true
			}
			if (_req.body.users && _req.body.users.length > 0) {
				let userFlag = _req.user && _req.user.roles && _req.user.roles.find(_r => _r.app === reqApp && _r.id == "PMGMUC" && _r.entity === "GROUP")
				let botFlag = _req.user && _req.user.roles && _req.user.roles.find(_r => _r.app === reqApp && _r.id == "PMGMBC" && _r.entity === "GROUP")
				if (!userFlag && !botFlag) return true
				let userExistFlag = _req.apiDetails.usersDetail.find(_u => !_u.bot)
				let botExistFlag = _req.apiDetails.usersDetail.find(_u => _u.bot)
				if (!userFlag && userExistFlag) return true
				if (!botFlag && botExistFlag) return true
			}
		}
		else if (_req.method === "PUT") {
			// User cannot change roles if he is part of that group.
			if (_req.apiDetails && _req.apiDetails.users && _req.body.roles && _req.apiDetails.roles && (_req.apiDetails.users.indexOf(_req.user._id) > -1) && !_.isEqual(JSON.parse(JSON.stringify(_req.body.roles)), JSON.parse(JSON.stringify(_req.apiDetails.roles)))) {
				logger.error("User cannot change roles if he is part of that group.")
				return true
			}

			// User cannot add or remove himself from group.
			let addedUser = _req.body.users ? _.difference(_req.body.users, _req.apiDetails.users) : []
			let removedUser = _req.body.users ? _.difference(_req.apiDetails.users, _req.body.users) : []
			if (addedUser.concat(removedUser).indexOf(_req.user._id) > -1) {
				logger.error("User cannot add or remove himself from group.")
				return true
			}

			let botList = _req.apiDetails.usersDetail.filter(_ud => _ud.bot).map(_ud => _ud._id)
			let userList = _req.apiDetails.usersDetail.filter(_ud => !_ud.bot).map(_ud => _ud._id)

			// Add member permission check
			if (addedUser.length > 0) {
				let userFlag = _req.user && _req.user.roles && _req.user.roles.find(_r => _r.app === reqApp && _r.id == "PMGMUC" && _r.entity === "GROUP")
				let botFlag = _req.user && _req.user.roles && _req.user.roles.find(_r => _r.app === reqApp && _r.id == "PMGMBC" && _r.entity === "GROUP")
				if (!userFlag && !botFlag) {
					logger.error("Add member permission check")
					return true
				}
				let userExistFlag = addedUser.some(_u => (userList.indexOf(_u) > -1))
				let botExistFlag = addedUser.some(_u => (botList.indexOf(_u) > -1))
				// let userExistFlag = _req.apiDetails.usersDetail.find(_u => !_u.bot && addedUser.indexOf(_u._id) > -1);
				// let botExistFlag = _req.apiDetails.usersDetail.find(_u => _u.bot && addedUser.indexOf(_u._id) > -1);
				if (!userFlag && userExistFlag) {
					logger.error("Add member permission check")
					return true
				}
				if (!botFlag && botExistFlag) {
					logger.error("Add member permission check")
					return true
				}
			}

			// Remove member permission check
			if (removedUser.length > 0) {
				let userFlag = _req.user && _req.user.roles && _req.user.roles.find(_r => _r.app === reqApp && _r.id == "PMGMUD" && _r.entity === "GROUP")
				let botFlag = _req.user && _req.user.roles && _req.user.roles.find(_r => _r.app === reqApp && _r.id == "PMGMBD" && _r.entity === "GROUP")
				if (!userFlag && !botFlag) {
					logger.error("Remove member permission check")
					return true
				}
				let userExistFlag = removedUser.some(_u => (userList.indexOf(_u) > -1))
				let botExistFlag = removedUser.some(_u => (botList.indexOf(_u) > -1))
				// let userExistFlag = _req.apiDetails.usersDetail.find(_u => !_u.bot && removedUser.indexOf(_u._id) > -1);
				// let botExistFlag = _req.apiDetails.usersDetail.find(_u => _u.bot && removedUser.indexOf(_u._id) > -1);
				if (!userFlag && userExistFlag) {
					logger.error("Remove member permission check")
					return true
				}
				if (!botFlag && botExistFlag) {
					logger.error("Remove member permission check")
					return true
				}
			}

			// Update Basic update permission check
			if (_req.body.name && (_req.body.name != _req.apiDetails.name)) {
				let flag = _req.user && _req.user.roles && _req.user.roles.find(_r => _r.app === reqApp && _r.id == "PMGBU" && _r.entity === "GROUP")
				if (!flag) {
					logger.error("Update Basic update permission check")
					return true
				}
			}

			// User cannot add or remove roles without permission.
			let keyList = ["id", "entity", "app"]

			let addedRoles = _req.body.roles ? _.differenceWith(_req.body.roles, _req.apiDetails.roles, (a, b) => keyList.every(_k => a[_k] === b[_k])) : []
			let removedRoles = _req.body.roles ? _.differenceWith(_req.apiDetails.roles, _req.body.roles, (a, b) => keyList.every(_k => a[_k] === b[_k])) : []
			logger.debug({ apiDetails: JSON.stringify(_req.apiDetails.roles), addedRoles, removedRoles })
			let flag = authUtil.validateRolesArray(addedRoles, _req.user.roles, "M")
			let removedWithPerm = authUtil.validateRolesArray(removedRoles, _req.user.roles, "V")
			let removedWithoutPerm = _req.body.roles ? _.differenceWith(removedRoles, removedWithPerm, (a, b) => keyList.every(_k => a[_k] === b[_k])) : []
			if (_req.body.roles) {
				_req.body.roles = _req.body.roles.concat(removedWithoutPerm)
			}
			logger.debug(JSON.stringify({ removedWithPerm, removedWithoutPerm, roles: _req.body.roles }))
			if (!flag) {
				logger.debug("Roles changed " + JSON.stringify(addedRoles))
				logger.error("User cannot add or remove roles without permission.")
			}
			return !flag
		}

	}
	if (_req.path.startsWith("/api/a/rbac/group") && _req.method === "DELETE") {
		if (appsAllowed.indexOf(reqApp) > -1) return false
		let groupManageFlag = _req.user && _req.user.roles && _req.user.roles.find(_r => _r.app === reqApp && _r.id == "PMGBD" && _r.entity === "GROUP")
		return !groupManageFlag
	}

	if (authUtil.compareUrl("/api/a/rbac/usr/{userId}/appAdmin/{action}", _req.path)) {
		let appAdminFlag = accessLevel == "Selected" && reqApp.length > 0 && reqApp.every(_reqA => (appsAllowed.indexOf(_reqA) > -1))
		return !appAdminFlag
	}

	if (authUtil.compareUrl("/api/a/rbac/usr/{id}/allRoles", _req.path)) {
		let selfUserFlag = _req.user._id === pathSegment[5]
		let appAdminFlag = accessLevel == "Selected" && _req.apiDetails.app.length > 0 && _req.apiDetails.app.some(_app => appsAllowed.indexOf(_app) > -1)
		let manageUserFlag = _req.user.roles && _req.user.roles.find(_r => (_req.apiDetails.bot ? _r.id.startsWith("PMB") : _r.id.startsWith("PMU")) && _r.entity === "USER" && _req.apiDetails.app.indexOf(_r.app) > -1)
		return !(selfUserFlag || appAdminFlag || manageUserFlag)
	}
	if (authUtil.compareUrl("/api/a/rbac/usr/{id}/closeAllSessions", _req.path) && _req.method === "DELETE") {
		let appAdminFlag = accessLevel == "Selected" && _req.apiDetails.app.length > 0 && _req.apiDetails.app.some(_app => appsAllowed.indexOf(_app) > -1)
		let manageUserFlag = _req.user.roles.find(_r => (_req.apiDetails.bot ? _r.id === "PMBA" : _r.id === "PMUA") && _r.entity === "USER" && _req.apiDetails.app.indexOf(_r.app) > -1)
		return !(appAdminFlag || manageUserFlag)
	}
	if (authUtil.compareUrl("/api/a/rbac/bot/botKey/{_id}", _req.path) && ["POST", "PUT", "DELETE"].indexOf(_req.method) > -1) {
		let appAdminFlag = accessLevel == "Selected" && _req.apiDetails.app.length > 0 && _req.apiDetails.app.some(_app => appsAllowed.indexOf(_app) > -1)
		let pId = null
		if (_req.method == "POST") pId = "PMBBC"
		if (_req.method == "PUT") pId = "PMBBU"
		if (_req.method == "DELETE") pId = "PMBBD"
		let manageUserFlag = _req.user.roles.find(_r => _r.id === pId && _r.entity === "USER" && _req.apiDetails.app.indexOf(_r.app) > -1)
		return !(appAdminFlag || manageUserFlag)
	}
	if (authUtil.compareUrl("/api/a/rbac/bot/botKey/session/{_id}", _req.path) && _req.method === "DELETE") {
		let appAdminFlag = accessLevel == "Selected" && _req.apiDetails.app.length > 0 && _req.apiDetails.app.some(_app => appsAllowed.indexOf(_app) > -1)
		let manageUserFlag = _req.user.roles.find(_r => _r.id === "PMBA" && _r.entity === "USER" && _req.apiDetails.app.indexOf(_r.app) > -1)
		return !(appAdminFlag || manageUserFlag)
	}
	if (authUtil.compareUrl("/api/a/rbac/{userType}/{_id}/status/{userState}", _req.path) && _req.method === "PUT") {
		let appAdminFlag = accessLevel == "Selected" && _req.apiDetails.app.length > 0 && _req.apiDetails.app.some(_app => appsAllowed.indexOf(_app) > -1)
		let pathSplit = _req.path.split("/")
		let userType = pathSplit[4] ? pathSplit[4] : null
		let isBot = (userType == "bot") ? true : false
		let manageUserFlag = _req.user.roles.find(_r => (isBot ? _r.id === "PMBA" : _r.id === "PMUA") && _r.entity === "USER" && _req.apiDetails.app.indexOf(_r.app) > -1)
		return !(appAdminFlag || manageUserFlag)
	}
	if (authUtil.compareUrl("/api/a/rbac/usr/app/{app}/create", _req.path) || authUtil.compareUrl("/api/a/rbac/usr/{username}/{app}/import", _req.path)) {
		let app = pathSegment[6]
		let appAdminsFlag = accessLevel == "Selected" && (appsAllowed.indexOf(app) > -1)
		if (appAdminsFlag) return false
		let isBot = _req.body && _req.body.user && _req.body.user.bot
		if (authUtil.compareUrl("/api/a/rbac/usr/{username}/{app}/import", _req.path)) isBot = _req.apiDetails && _req.apiDetails.bot
		logger.debug({ isBot })
		let manageUserFlag = _req.user.roles.find(_r => (isBot ? _r.id === "PMBBC" : _r.id === "PMUBC") && _r.entity === "USER" && _r.app === app)
		let manageGroupFlag = _req.user.roles.find(_r => (isBot ? _r.id === "PMBG" : _r.id === "PMUG") && _r.entity === "USER" && _r.app === app)
		if (_req.body.groups && _req.body.groups.length > 0 && !manageGroupFlag) return true
		return !manageUserFlag
	}
	if (authUtil.compareUrl("/api/a/rbac/usr/{usrId}/addToGroups", _req.path) || authUtil.compareUrl("/api/a/rbac/usr/{usrId}/removeFromGroups", _req.path)) {
		let appAdmins = accessLevel == "Selected" ? _.intersection(appsAllowed, _req.apiDetails.app) : []
		appAdmins = _.uniq(appAdmins)
		if (appAdmins.indexOf(_req.apiDetails.app[0]) > -1) return false
		if (pathSegment[5] === _req.user._id) return true
		let isBot = _req.apiDetails.bot
		let appsAllowedMG = _req.user.roles.filter(_r => (isBot ? _r.id === "PMBG" : _r.id === "PMUG") && _r.entity === "USER").map(_r => _r.app)
		let manageGroupApps = _.intersection(appsAllowedMG, _req.apiDetails.app)
		let allAppAccess = appAdmins.concat(manageGroupApps)
		return !(_req.apiDetails.app && _req.apiDetails.app.every(_a => (allAppAccess.indexOf(_a) > -1)))
		// return !_.isEqual(appAdmins.concat(manageGroupApps), _req.apiDetails.app);
	}
	if (authUtil.compareUrl("/api/a/rbac/usr/{id}/reset", _req.path)) {
		let appAdminFlag = accessLevel == "Selected" && _req.apiDetails.app.length > 0 && _req.apiDetails.app.some(_app => appsAllowed.indexOf(_app) > -1)
		let manageUserFlag = _req.user.roles.find(_r => (_req.apiDetails.bot ? _r.id === "PMBA" : _r.id === "PMUA") && _r.entity === "USER" && (_req.apiDetails.app.indexOf(_r.app) > -1))
		return !(appAdminFlag || manageUserFlag)
	}
	if ((authUtil.compareUrl("/api/a/rbac/usr", _req.path) || authUtil.compareUrl("/api/a/rbac/usr/{id}", _req.path) || authUtil.compareUrl("/api/a/rbac/usr/count", _req.path)) && _req.method === "GET") {
		if (_req.query.select)
			_req.query.select = authUtil.addSelect(["isSuperAdmin", "bot"], _req.query.select)
		return false
	}
	if ((authUtil.compareUrl("/api/a/rbac/group", _req.path) || authUtil.compareUrl("/api/a/rbac/group/count", _req.path)) && _req.method === "GET") {
		return !_req.user.isSuperAdmin
	}

	if ((authUtil.compareUrl("/api/a/rbac/usr/app/{app}", _req.path) || authUtil.compareUrl("/api/a/rbac/usr/app/{app}/count", _req.path)) && _req.method === "GET") {
		if (accessLevel === "Selected" && appsAllowed.indexOf(pathSegment[6]) > -1) return false
		let mu = _req.user.roles.find(_r => (_r.id.startsWith("PMU") || _r.id.startsWith("PVU")) && _r.app === pathSegment[6] && _r.entity === "USER")
		if (mu) return false
		let mg = _req.user.roles.find(_r => authUtil.groupMemberPermArr.indexOf(_r.id) && _r.app === pathSegment[6] && _r.entity === "GROUP")
		if (mg) {
			_req.query.select = "_id,username,basicDetails.name,bot"
			return false
		}
		return true
	}

	if ((authUtil.compareUrl("/api/a/rbac/usr/app/{app}/{groupId}", _req.path) || authUtil.compareUrl("/api/a/rbac/usr/app/{app}/{groupId}/count", _req.path)) && _req.method === "GET") {
		if (accessLevel === "Selected" && appsAllowed.indexOf(pathSegment[6]) > -1) return false
		let mu = _req.user.roles.find(_r => (_r.id.startsWith("PMU") || _r.id.startsWith("PVU")) && _r.app === pathSegment[6] && _r.entity === "USER")
		if (mu) return false
		let mg = _req.user.roles.find(_r => ["PVGMU", "PMGMUC", "PMGMUD"].indexOf(_r.id) && _r.app === pathSegment[6] && _r.entity === "GROUP")
		if (mg) {
			_req.query.select = "_id,username,basicDetails.name,bot"
			return false
		}
		return true
	}

	if ((authUtil.compareUrl("/api/a/rbac/bot/app/{app}/{groupId}", _req.path) || authUtil.compareUrl("/api/a/rbac/bot/app/{app}/{groupId}/count", _req.path)) && _req.method === "GET") {
		if (accessLevel === "Selected" && appsAllowed.indexOf(pathSegment[6]) > -1) return false
		let mu = _req.user.roles.find(_r => (_r.id.startsWith("PMB") || _r.id.startsWith("PVB")) && _r.app === pathSegment[6] && _r.entity === "USER")
		if (mu) return false
		let mg = _req.user.roles.find(_r => ["PVGMB", "PMGMBC", "PMGMBD"].indexOf(_r.id) && _r.app === pathSegment[6] && _r.entity === "GROUP")
		if (mg) {
			_req.query.select = "_id,username,basicDetails.name,bot"
			return false
		}
		return true
	}

	if ((authUtil.compareUrl("/api/a/rbac/usr/app/{app}/distinctAttributes", _req.path)) && _req.method === "GET") {
		if (accessLevel === "Selected" && appsAllowed.indexOf(pathSegment[6]) > -1) return false
		let mu = _req.user.roles.find(_r => (_r.id.startsWith("PMU") || _r.id.startsWith("PVU")) && _r.app === pathSegment[6] && _r.entity === "USER")
		if (mu) return false
		return true
	}

	if ((authUtil.compareUrl("/api/a/rbac/bot/app/{app}", _req.path) || authUtil.compareUrl("/api/a/rbac/bot/app/{app}/count", _req.path)) && _req.method === "GET") {
		if (accessLevel === "Selected" && appsAllowed.indexOf(pathSegment[6]) > -1) return false
		let mu = _req.user.roles.find(_r => (_r.id.startsWith("PMB") || _r.id.startsWith("PVB")) && _r.app === pathSegment[6] && _r.entity === "USER")
		if (mu) return false
		let mg = _req.user.roles.find(_r => (authUtil.groupMemberPermArr.indexOf(_r.id) > -1) && _r.app === pathSegment[6] && _r.entity === "GROUP")
		if (mg) {
			_req.query.select = "_id,username,basicDetails.name,bot"
			return false
		}
		return true
	}
	if ((authUtil.compareUrl("/api/a/rbac/{app}/group", _req.path) || authUtil.compareUrl("/api/a/rbac/{app}/group/count", _req.path)) && _req.method === "GET") {
		if (accessLevel === "Selected" && (appsAllowed.indexOf(pathSegment[4]) > -1)) return false
		let mu = _req.user.roles.find(_r => (_r.id == "PMUG" || _r.id == "PMBG") && _r.app === pathSegment[4] && _r.entity === "USER")
		if (mu) return false
		let mg = _req.user.roles.find(_r => (_r.id.startsWith("PMG") || _r.id.startsWith("PVG")) && _r.app === pathSegment[4] && _r.entity === "GROUP")
		return !mg
	}
	if (authUtil.compareUrl("/api/a/rbac/usr/{usrId}/addToApps", _req.path)) {
		return !_req.user.isSuperAdmin
	}
	// if (authUtil.compareUrl('/api/a/rbac/usr/{username}/{app}/import', _req.path)) {
	//     if (accessLevel === 'Selected' && appsAllowed.indexOf(pathSegment[6]) > -1) return false;
	//     return !_req.user.roles.find(_r => (_req.apiDetails.bot ? _r.id === 'PMB' : _r.id === 'PMU') && _r.app === pathSegment[6] && _r.entity === 'USER');
	// }
	if (authUtil.compareUrl("/api/a/rbac/{auth}/search", _req.path)) {
		if (accessLevel === "Selected" && appsAllowed && appsAllowed.length > 0) return false
		return !_req.user.roles.find(_r => (_r.id === "PMUBCE") && _r.entity === "USER")
	}
	if (authUtil.compareUrl("/api/a/rbac/{auth}/import", _req.path) || authUtil.compareUrl("/api/a/rbac/{auth}/search", _req.path)) {
		let appAdminsFlag = accessLevel == "Selected" && appsAllowed.length > 0
		let manageUserFlag = _req.user.roles.find(_r => _r.id === "PMUBCE" && _r.entity === "USER")
		return !(appAdminsFlag || manageUserFlag)
	}
	if (authUtil.compareUrl("/api/a/rbac/usr/{id}/password", _req.path) && _req.method === "PUT") {
		return !_req.user._id === pathSegment[5];
	}
	if (_req.path.startsWith("/api/a/rbac/usr") && _req.method === "PUT") {
		let appAdminFlag = accessLevel == "Selected" && _req.apiDetails.app.length > 0 && _req.apiDetails.app.some(_app => appsAllowed.indexOf(_app) > -1)
		let basicField = ["attributes", "basicDetails", "description"]
		let selfField = ["basicDetails", "description"]
		let accessField = ["isActive"]
		let basicChange = basicField.some(_k => fieldChanged(_k, _req))
		let accessChange = accessField.some(_k => fieldChanged(_k, _req))
		let selfChange = selfField.some(_k => fieldChanged(_k, _req))
		let basicUserFlag = _req.user.roles.find(_r => (_req.apiDetails.bot ? _r.id === "PMBBU" : _r.id === "PMUBU") && _r.entity === "USER" && _req.apiDetails.app.indexOf(_r.app) > -1)
		let accessUserFlag = _req.user.roles.find(_r => (_req.apiDetails.bot ? _r.id === "PMBBU" : _r.id === "PMUBU") && _r.entity === "USER" && _req.apiDetails.app.indexOf(_r.app) > -1)
		let selfFlag = pathSegment[5] === _req.user._id
		let flag = (appAdminFlag || (!basicChange && !accessChange && selfChange && selfFlag))
		if (flag) return false
		if (basicChange) {
			if (!basicUserFlag) return true
		}
		if (accessChange) {
			if (!accessUserFlag) return true
		}
	}
	if (authUtil.compareUrl("/api/a/rbac/config", _req.path) || authUtil.compareUrl("/api/a/rbac/config/{id}", _req.path)) {
		return true
	}
}

function userAuthorizationMw(req, res, next) {
	// TODO
	// /api/a/rbac/authType should not go through AUTHZ checks
	if (gwUtil.isPermittedURL(req)) return next()
	try {
		if (isUserAccessControlInvalid(req)) {
			commonAuthzMw.sendForbidden(res)
			return
		}
	} catch (err) {
		logger.error('Error in userAuthorizationMw :: ', err);
		return next(err)
	}
	return next()
}

module.exports = userAuthorizationMw;