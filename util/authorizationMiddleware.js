
let authLogic = require("./auth.js");
const _ = require("lodash");
const authUtil = require("./authUtil");
let logger = global.logger;

let e = {};

function sendForbidden(_res) {
	_res.status(403).json({
		message: "Not permitted"
	});
}

const NO_ACCESS_API = ["/api/a/rbac/role"];

function getRbacApp(_req) {
	let pathSegment = _req.path.split("/");
	if (_req.path.startsWith("/api/a/rbac/role")) {
		if (_req.method == "POST" || _req.method == "PUT") {
			return _req.body.app;
		}
	}
	else if (authUtil.compareUrl("/api/a/rbac/app/{app}/removeUsers", _req.path) || authUtil.compareUrl("/api/a/rbac/app/{app}/removeBots", _req.path)) {
		return pathSegment[5];
	}
	else if (_req.path.startsWith("/api/a/rbac/app")) {
		if (_req.method == "PUT" || _req.method == "DELETE") {
			return _req.path.split("/").pop();
		}
		if (_req.method == "POST") {
			return _req.body._id;
		}
	} else if (_req.path.startsWith("/api/a/rbac/group")) {
		return _req.apiDetails ? _req.apiDetails.app : null;
	} else if (authUtil.compareUrl("/api/a/rbac/usr/{userId}/appAdmin/{action}", _req.path)) {
		return _req.body.apps;
	} else if (authUtil.compareUrl("/api/a/sm/usr/{app}/service/start", _req.path) || authUtil.compareUrl("/api/a/sm/usr/{app}/service/stop", _req.path)) {
		return pathSegment[5];
	}
	return null;
}

function isAccessControlInvalid(_req) {
	logger.debug(`[${_req.headers.TxnId}] Checking user auth`);
	let accessLevel = _req.user.accessControl.accessLevel;
	let pathSegment = _req.path.split("/");
	if (_req.user.isSuperAdmin) return false;
	if (_req.path == "/api/a/rbac/app" && (_req.method == "POST" || _req.method == "DELETE") && !_req.user.isSuperAdmin) {
		return true;
	}
	if (accessLevel != "Selected") {
		if (NO_ACCESS_API.some(key => _req.path.startsWith(key)) && (_req.method == "POST" || _req.method == "DELETE" || _req.method == "PUT")) {
			return true;
		}
	}
	let reqApp = getRbacApp(_req);
	let appsAllowed = [];
	if (accessLevel == "Selected") {
		appsAllowed = _req.user.accessControl.apps ? _req.user.accessControl.apps.map(obj => obj._id) : [];
	}
	if (authUtil.compareUrl("/api/a/rbac/app/{app}/bookmark", _req.path) || authUtil.compareUrl("/api/a/rbac/app/{app}/bookmark/count", _req.path)) {
		let permissionApp = [];
		let allowedPermission = [];
		let app = pathSegment[5];
		if (_req.method === "GET") {
			allowedPermission = ["PMBM", "PVBM"];
		} else if (_req.method === "POST") {
			allowedPermission = ["PMBM"];
		}
		permissionApp = _req.user.roles.filter(_r => (allowedPermission.indexOf(_r.id) > -1) && _r.entity === "BM").map(_r => _r.app);
		let appPermission = appsAllowed.concat(permissionApp).indexOf(app) == -1;
		logger.debug(`[${_req.headers.TxnId}] ${JSON.stringify({ appPermission, app })}`);
		if (!appPermission)
			return false;
		if (_req.method === "GET") {
			let manageGroupApps = _req.user.roles.filter(_r => (_r.id === "PMGABM" || _r.id === "PVGABM" || _r.id === "PMGCBM" || _r.id === "PVGCBM") && _r.entity === "GROUP").map(_r => _r.app);
			let exceptionBM = _req.user.roles.filter(_r => (_r.id === "PMBM" || _r.id === "PVBM") && _r.entity.startsWith("BM_")).map(_r => _r.entity.substr(3));
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
			};
			if (_req.query.filter) {
				let oldFilter = _req.query.filter;
				customFilter["$and"].push(typeof oldFilter === "object" ? oldFilter : JSON.parse(oldFilter));
			}
			_req.query.filter = JSON.stringify(customFilter);
			if (appsAllowed.concat(permissionApp).length == 0 && exceptionBM.length === 0 && manageGroupApps.length > 0) {
				_req.query.select = "_id,name,app,_metadata";
			}
			return false;
		}
		return true;
	}
	if (authUtil.compareUrl("/api/a/rbac/app/{app}/bookmark/bulkDelete", _req.path) || authUtil.compareUrl("/api/a/rbac/app/{app}/bookmark/{id}", _req.path)) {
		let app = pathSegment[5];
		let permissionApp = [];
		let allowedPermission = [];
		if (_req.method === "GET") {
			allowedPermission = ["PMBM", "PVBM"];
		} else if (_req.method === "PUT" || _req.method === "DELETE") {
			allowedPermission = ["PMBM"];
		}
		permissionApp = _req.user.roles.filter(_r => (allowedPermission.indexOf(_r.id) > -1) && _r.entity === "BM").map(_r => _r.app);
		let appPermission = appsAllowed.concat(permissionApp).indexOf(app) == -1;
		if (!appPermission) return false;
		if (_req.method === "GET") {
			let manageGroupApps = _req.user.roles.filter(_r => (_r.id === "PMGABM" || _r.id === "PVGABM" || _r.id === "PMGCBM" || _r.id === "PVGCBM") && _r.entity === "GROUP").map(_r => _r.app);
			let exceptionBM = _req.user.roles.filter(_r => (_r.id === "PMBM" || _r.id === "PVBM") && _r.entity.startsWith("BM_")).map(_r => _r.entity.substr(3));
			if (appsAllowed.concat(permissionApp).length == 0 && exceptionBM.length === 0 && manageGroupApps.length > 0) {
				_req.query.select = "_id,name,app,_metadata";
			}
			return false;
		}
		else if (_req.method === "PUT" || _req.method === "DELETE") {
			let exceptionBM = _req.user.roles.filter(_r => (_r.id === "PMBM") && _r.entity.startsWith("BM_")).map(_r => _r.entity.substr(3));
			return exceptionBM.indexOf(app) === -1;
		}
		return true;
	}
	if (_req.path.startsWith("/api/a/rbac/role") && (_req.method === "PUT" || _req.method === "POST" || _req.method === "DELETE")) {
		return true;
	}
	if (authUtil.compareUrl("/api/a/sec/identity/{appName}", _req.path) || authUtil.compareUrl("/api/a/sec/identity/{appName}/{action}", _req.path) || authUtil.compareUrl("/api/a/sec/identity/{appName}/certificate/{action}", _req.path)) {
		let appAdminFlag = accessLevel == "Selected" && appsAllowed.indexOf(pathSegment[5]) > -1;
		return !appAdminFlag;
	}
	if(authUtil.compareUrl("/api/a/sec/enc/{appName}/decrypt", _req.path) && _req.method == "POST") {
		// checking if user has any role from that app.
		let app = _req.path.split("/")[5];
		return !_req.user.roles.some(role => role.app === app);

	}
	if (_req.path.startsWith("/api/a/sec/keys")) {
		return !_req.user.isSuperAdmin;
	}
	if (authUtil.compareUrl("/api/a/rbac/usr", _req.path) && _req.path === "POST") {
		return !_req.user.isSuperAdmin;
	}
	if (authUtil.compareUrl("/api/a/sm/{app}/service/stop", _req.path) || authUtil.compareUrl("/api/a/sm/{app}/service/start", _req.path)) {
		let appAdminFlag = accessLevel == "Selected" && appsAllowed.indexOf(pathSegment[4]) > -1;
		return !appAdminFlag;
	}
	if (authUtil.compareUrl("/api/a/rbac/app/{app}/removeUsers", _req.path)) {
		let appAdminFlag = accessLevel == "Selected" && reqApp && (appsAllowed.indexOf(reqApp) > -1);
		let appsAllowedMU = _req.user.roles.filter(_r => _r.id === "PMUBD" && _r.entity === "USER").map(_r => _r.app);
		let userManageFlag = reqApp && (appsAllowedMU.indexOf(reqApp) > -1);
		if (_req.body && _req.body.userIds && (_req.body.userIds.indexOf(_req.user._id) > -1)) return true;
		return !(appAdminFlag || userManageFlag);
	}
	if (authUtil.compareUrl("/api/a/rbac/app/{app}/removeBots", _req.path)) {
		let appAdminFlag = accessLevel == "Selected" && reqApp && (appsAllowed.indexOf(reqApp) > -1);
		let appsAllowedMB = _req.user.roles.filter(_r => _r.id === "PMBBD" && _r.entity === "USER").map(_r => _r.app);
		let botManageFlag = reqApp && (appsAllowedMB.indexOf(reqApp) > -1);
		return !(appAdminFlag || botManageFlag);
	}
	if (_req.path.startsWith("/api/a/rbac/app") && (_req.method === "DELETE" || _req.method === "POST")) {
		return true;
	}
	if (_req.path.startsWith("/api/a/rbac/app") && _req.method === "PUT") {
		let appAdminFlag = accessLevel == "Selected" && reqApp && (appsAllowed.indexOf(reqApp) > -1);
		return !appAdminFlag;
	}

	if (_req.path.startsWith("/api/a/rbac/group") && (_req.method === "PUT" || _req.method === "POST")) {
		let appAdminFlag = accessLevel == "Selected" && reqApp && (appsAllowed.indexOf(reqApp) > -1);
		if (appAdminFlag) return false;
		if (_req.method === "POST") {
			let groupCreateFlag = _req.user && _req.user.roles && _req.user.roles.find(_r => _r.app === reqApp && _r.id == "PMGBC" && _r.entity === "GROUP");
			if (!groupCreateFlag) return true;
			if (_req.body.roles && _req.body.roles.length > 0) {
				if (_req.body.users && (_req.body.users.indexOf(_req.user._id) > -1)) return true;
				let rolesFlag = authUtil.validateRolesArray(_req.body.roles, _req.user.roles, "M");
				if (!rolesFlag) return true;
			}
			if (_req.body.users && _req.body.users.length > 0) {
				let userFlag = _req.user && _req.user.roles && _req.user.roles.find(_r => _r.app === reqApp && _r.id == "PMGMUC" && _r.entity === "GROUP");
				let botFlag = _req.user && _req.user.roles && _req.user.roles.find(_r => _r.app === reqApp && _r.id == "PMGMBC" && _r.entity === "GROUP");
				if (!userFlag && !botFlag) return true;
				let userExistFlag = _req.apiDetails.usersDetail.find(_u => !_u.bot);
				let botExistFlag = _req.apiDetails.usersDetail.find(_u => _u.bot);
				if (!userFlag && userExistFlag) return true;
				if (!botFlag && botExistFlag) return true;
			}
		}
		else if (_req.method === "PUT") {
			// User cannot change roles if he is part of that group.
			if (_req.apiDetails && _req.apiDetails.users && _req.body.roles && _req.apiDetails.roles && (_req.apiDetails.users.indexOf(_req.user._id) > -1) && !_.isEqual(JSON.parse(JSON.stringify(_req.body.roles)), JSON.parse(JSON.stringify(_req.apiDetails.roles)))) {
				logger.error(`[${_req.headers.TxnId}] User cannot change roles if he is part of that group.`);
				return true;
			}

			// User cannot add or remove himself from group.
			let addedUser = _req.body.users ? _.difference(_req.body.users, _req.apiDetails.users) : [];
			let removedUser = _req.body.users ? _.difference(_req.apiDetails.users, _req.body.users) : [];
			if (addedUser.concat(removedUser).indexOf(_req.user._id) > -1) {
				logger.error(`[${_req.headers.TxnId}] User cannot add or remove himself from group.`);
				return true;
			}

			let botList = _req.apiDetails.usersDetail.filter(_ud => _ud.bot).map(_ud => _ud._id);
			let userList = _req.apiDetails.usersDetail.filter(_ud => !_ud.bot).map(_ud => _ud._id);

			// Add member permission check
			if (addedUser.length > 0) {
				let userFlag = _req.user && _req.user.roles && _req.user.roles.find(_r => _r.app === reqApp && _r.id == "PMGMUC" && _r.entity === "GROUP");
				let botFlag = _req.user && _req.user.roles && _req.user.roles.find(_r => _r.app === reqApp && _r.id == "PMGMBC" && _r.entity === "GROUP");
				if (!userFlag && !botFlag) {
					logger.error(`[${_req.headers.TxnId}] Add member permission check`);
					return true;
				}
				let userExistFlag = addedUser.some(_u => (userList.indexOf(_u) > -1));
				let botExistFlag = addedUser.some(_u => (botList.indexOf(_u) > -1));
				// let userExistFlag = _req.apiDetails.usersDetail.find(_u => !_u.bot && addedUser.indexOf(_u._id) > -1);
				// let botExistFlag = _req.apiDetails.usersDetail.find(_u => _u.bot && addedUser.indexOf(_u._id) > -1);
				if (!userFlag && userExistFlag) {
					logger.error(`[${_req.headers.TxnId}] Add member permission check`);
					return true;
				}
				if (!botFlag && botExistFlag) {
					logger.error(`[${_req.headers.TxnId}] Add member permission check`);
					return true;
				}
			}

			// Remove member permission check
			if (removedUser.length > 0) {
				let userFlag = _req.user && _req.user.roles && _req.user.roles.find(_r => _r.app === reqApp && _r.id == "PMGMUD" && _r.entity === "GROUP");
				let botFlag = _req.user && _req.user.roles && _req.user.roles.find(_r => _r.app === reqApp && _r.id == "PMGMBD" && _r.entity === "GROUP");
				if (!userFlag && !botFlag) {
					logger.error(`[${_req.headers.TxnId}] Remove member permission check`);
					return true;
				}
				let userExistFlag = removedUser.some(_u => (userList.indexOf(_u) > -1));
				let botExistFlag = removedUser.some(_u => (botList.indexOf(_u) > -1));
				// let userExistFlag = _req.apiDetails.usersDetail.find(_u => !_u.bot && removedUser.indexOf(_u._id) > -1);
				// let botExistFlag = _req.apiDetails.usersDetail.find(_u => _u.bot && removedUser.indexOf(_u._id) > -1);
				if (!userFlag && userExistFlag) {
					logger.error(`[${_req.headers.TxnId}] Remove member permission check`);
					return true;
				}
				if (!botFlag && botExistFlag) {
					logger.error(`[${_req.headers.TxnId}] Remove member permission check`);
					return true;
				}
			}

			// Update Basic update permission check
			if (_req.body.name && (_req.body.name != _req.apiDetails.name)) {
				let flag = _req.user && _req.user.roles && _req.user.roles.find(_r => _r.app === reqApp && _r.id == "PMGBU" && _r.entity === "GROUP");
				if (!flag) {
					logger.error(`[${_req.headers.TxnId}] Update Basic update permission check`);
					return true;
				}
			}

			// User cannot add or remove roles without permission.
			let keyList = ["id", "entity", "app"];

			let addedRoles = _req.body.roles ? _.differenceWith(_req.body.roles, _req.apiDetails.roles, (a, b) => keyList.every(_k => a[_k] === b[_k])) : [];
			let removedRoles = _req.body.roles ? _.differenceWith(_req.apiDetails.roles, _req.body.roles, (a, b) => keyList.every(_k => a[_k] === b[_k])) : [];
			logger.debug(`[${_req.headers.TxnId}] ${JSON.stringify({ apiDetails: JSON.stringify(_req.apiDetails.roles), addedRoles, removedRoles })}`);
			let flag = authUtil.validateRolesArray(addedRoles, _req.user.roles, "M");
			let removedWithPerm = authUtil.validateRolesArray(removedRoles, _req.user.roles, "V");
			let removedWithoutPerm = _req.body.roles ? _.differenceWith(removedRoles, removedWithPerm, (a, b) => keyList.every(_k => a[_k] === b[_k])) : [];
			if (_req.body.roles) {
				_req.body.roles = _req.body.roles.concat(removedWithoutPerm);
			}
			logger.debug(`[${_req.headers.TxnId}] ${JSON.stringify({ removedWithPerm, removedWithoutPerm, roles: _req.body.roles })}`);
			if (!flag) {
				logger.debug(`[${_req.headers.TxnId}] Roles changed ${JSON.stringify(addedRoles)}`);
				logger.error(`[${_req.headers.TxnId}] User cannot add or remove roles without permission.`);
			}
			return !flag;
		}

	}
	if (_req.path.startsWith("/api/a/rbac/group") && _req.method === "DELETE") {
		if (appsAllowed.indexOf(reqApp) > -1) return false;
		let groupManageFlag = _req.user && _req.user.roles && _req.user.roles.find(_r => _r.app === reqApp && _r.id == "PMGBD" && _r.entity === "GROUP");
		return !groupManageFlag;
	}

	if (authUtil.compareUrl("/api/a/rbac/usr/{userId}/appAdmin/{action}", _req.path)) {
		let appAdminFlag = accessLevel == "Selected" && reqApp.length > 0 && reqApp.every(_reqA => (appsAllowed.indexOf(_reqA) > -1));
		return !appAdminFlag;
	}
	if (authUtil.compareUrl("/api/a/sm/usr/{app}/service/start", _req.path) || authUtil.compareUrl("/api/a/sm/usr/{app}/service/stop", _req.path)) {
		let appAdminFlag = accessLevel == "Selected" && reqApp && (appsAllowed.indexOf(reqApp) > -1);
		return !appAdminFlag;
	}

	if (authUtil.compareUrl("/api/a/rbac/usr/{id}/allRoles", _req.path)) {
		let selfUserFlag = _req.user._id === pathSegment[5];
		let appAdminFlag = accessLevel == "Selected" && _req.apiDetails.app.length > 0 && _req.apiDetails.app.some(_app => appsAllowed.indexOf(_app) > -1);
		let manageUserFlag = _req.user.roles && _req.user.roles.find(_r => (_req.apiDetails.bot ? _r.id.startsWith("PMB") : _r.id.startsWith("PMU")) && _r.entity === "USER" && _req.apiDetails.app.indexOf(_r.app) > -1);
		return !(selfUserFlag || appAdminFlag || manageUserFlag);
	}
	if (authUtil.compareUrl("/api/a/rbac/usr/{id}/closeAllSessions", _req.path) && _req.method === "DELETE") {
		let appAdminFlag = accessLevel == "Selected" && _req.apiDetails.app.length > 0 && _req.apiDetails.app.some(_app => appsAllowed.indexOf(_app) > -1);
		let manageUserFlag = _req.user.roles.find(_r => (_req.apiDetails.bot ? _r.id === "PMBA" : _r.id === "PMUA") && _r.entity === "USER" && _req.apiDetails.app.indexOf(_r.app) > -1);
		return !(appAdminFlag || manageUserFlag);
	}
	if (authUtil.compareUrl("/api/a/rbac/bot/botKey/{_id}", _req.path) && ["POST", "PUT", "DELETE"].indexOf(_req.method) > -1) {
		let appAdminFlag = accessLevel == "Selected" && _req.apiDetails.app.length > 0 && _req.apiDetails.app.some(_app => appsAllowed.indexOf(_app) > -1);
		let pId = null;
		if (_req.method == "POST") pId = "PMBBC";
		if (_req.method == "PUT") pId = "PMBBU";
		if (_req.method == "DELETE") pId = "PMBBD";
		let manageUserFlag = _req.user.roles.find(_r => _r.id === pId && _r.entity === "USER" && _req.apiDetails.app.indexOf(_r.app) > -1);
		return !(appAdminFlag || manageUserFlag);
	}
	if (authUtil.compareUrl("/api/a/rbac/bot/botKey/session/{_id}", _req.path) && _req.method === "DELETE") {
		let appAdminFlag = accessLevel == "Selected" && _req.apiDetails.app.length > 0 && _req.apiDetails.app.some(_app => appsAllowed.indexOf(_app) > -1);
		let manageUserFlag = _req.user.roles.find(_r => _r.id === "PMBA" && _r.entity === "USER" && _req.apiDetails.app.indexOf(_r.app) > -1);
		return !(appAdminFlag || manageUserFlag);
	}
	if (authUtil.compareUrl("/api/a/rbac/{userType}/{_id}/status/{userState}", _req.path) && _req.method === "PUT") {
		let appAdminFlag = accessLevel == "Selected" && _req.apiDetails.app.length > 0 && _req.apiDetails.app.some(_app => appsAllowed.indexOf(_app) > -1);
		let pathSplit = _req.path.split("/");
		let userType = pathSplit[4] ? pathSplit[4] : null;
		let isBot = (userType == "bot") ? true : false;
		let manageUserFlag = _req.user.roles.find(_r => (isBot ? _r.id === "PMBA" : _r.id === "PMUA") && _r.entity === "USER" && _req.apiDetails.app.indexOf(_r.app) > -1);
		return !(appAdminFlag || manageUserFlag);
	}
	if (authUtil.compareUrl("/api/a/rbac/usr/app/{app}/create", _req.path) || authUtil.compareUrl("/api/a/rbac/usr/{username}/{app}/import", _req.path)) {
		let app = pathSegment[6];
		let appAdminsFlag = accessLevel == "Selected" && (appsAllowed.indexOf(app) > -1);
		if (appAdminsFlag) return false;
		let isBot = _req.body && _req.body.user && _req.body.user.bot;
		if (authUtil.compareUrl("/api/a/rbac/usr/{username}/{app}/import", _req.path)) isBot = _req.apiDetails && _req.apiDetails.bot;
		logger.debug(`[${_req.headers.TxnId}] isBot :: ${isBot}`);
		let manageUserFlag = _req.user.roles.find(_r => (isBot ? _r.id === "PMBBC" : _r.id === "PMUBC") && _r.entity === "USER" && _r.app === app);
		let manageGroupFlag = _req.user.roles.find(_r => (isBot ? _r.id === "PMBG" : _r.id === "PMUG") && _r.entity === "USER" && _r.app === app);
		if (_req.body.groups && _req.body.groups.length > 0 && !manageGroupFlag) return true;
		return !manageUserFlag;
	}
	if (authUtil.compareUrl("/api/a/rbac/usr/{usrId}/addToGroups", _req.path) || authUtil.compareUrl("/api/a/rbac/usr/{usrId}/removeFromGroups", _req.path)) {
		let appAdmins = accessLevel == "Selected" ? _.intersection(appsAllowed, _req.apiDetails.app) : [];
		appAdmins = _.uniq(appAdmins);
		if (appAdmins.indexOf(_req.apiDetails.app[0]) > -1) return false;
		if (pathSegment[5] === _req.user._id) return true;
		let isBot = _req.apiDetails.bot;
		let appsAllowedMG = _req.user.roles.filter(_r => (isBot ? _r.id === "PMBG" : _r.id === "PMUG") && _r.entity === "USER").map(_r => _r.app);
		let manageGroupApps = _.intersection(appsAllowedMG, _req.apiDetails.app);
		let allAppAccess = appAdmins.concat(manageGroupApps);
		return !(_req.apiDetails.app && _req.apiDetails.app.every(_a => (allAppAccess.indexOf(_a) > -1)));
		// return !_.isEqual(appAdmins.concat(manageGroupApps), _req.apiDetails.app);
	}
	if (authUtil.compareUrl("/api/a/rbac/usr/{id}/reset", _req.path)) {
		let appAdminFlag = accessLevel == "Selected" && _req.apiDetails.app.length > 0 && _req.apiDetails.app.some(_app => appsAllowed.indexOf(_app) > -1);
		let manageUserFlag = _req.user.roles.find(_r => (_req.apiDetails.bot ? _r.id === "PMBA" : _r.id === "PMUA") && _r.entity === "USER" && (_req.apiDetails.app.indexOf(_r.app) > -1));
		return !(appAdminFlag || manageUserFlag);
	}
	if ((authUtil.compareUrl("/api/a/rbac/usr", _req.path) || authUtil.compareUrl("/api/a/rbac/usr/{id}", _req.path) || authUtil.compareUrl("/api/a/rbac/usr/count", _req.path)) && _req.method === "GET") {
		if (_req.query.select)
			_req.query.select = authUtil.addSelect(["isSuperAdmin", "bot"], _req.query.select);
		return false;
	}
	if ((authUtil.compareUrl("/api/a/rbac/group", _req.path) || authUtil.compareUrl("/api/a/rbac/group/count", _req.path)) && _req.method === "GET") {
		return !_req.user.isSuperAdmin;
	}

	if ((authUtil.compareUrl("/api/a/rbac/usr/app/{app}", _req.path) || authUtil.compareUrl("/api/a/rbac/usr/app/{app}/count", _req.path)) && _req.method === "GET") {
		if (accessLevel === "Selected" && appsAllowed.indexOf(pathSegment[6]) > -1) return false;
		let mu = _req.user.roles.find(_r => (_r.id.startsWith("PMU") || _r.id.startsWith("PVU")) && _r.app === pathSegment[6] && _r.entity === "USER");
		if (mu) return false;
		let mg = _req.user.roles.find(_r => authUtil.groupMemberPermArr.indexOf(_r.id) && _r.app === pathSegment[6] && _r.entity === "GROUP");
		if (mg) {
			_req.query.select = "_id,username,basicDetails.name,bot";
			return false;
		}
		return true;
	}

	if ((authUtil.compareUrl("/api/a/rbac/usr/app/{app}/{groupId}", _req.path) || authUtil.compareUrl("/api/a/rbac/usr/app/{app}/{groupId}/count", _req.path)) && _req.method === "GET") {
		if (accessLevel === "Selected" && appsAllowed.indexOf(pathSegment[6]) > -1) return false;
		let mu = _req.user.roles.find(_r => (_r.id.startsWith("PMU") || _r.id.startsWith("PVU")) && _r.app === pathSegment[6] && _r.entity === "USER");
		if (mu) return false;
		let mg = _req.user.roles.find(_r => ["PVGMU", "PMGMUC", "PMGMUD"].indexOf(_r.id) && _r.app === pathSegment[6] && _r.entity === "GROUP");
		if (mg) {
			_req.query.select = "_id,username,basicDetails.name,bot";
			return false;
		}
		return true;
	}

	if ((authUtil.compareUrl("/api/a/rbac/bot/app/{app}/{groupId}", _req.path) || authUtil.compareUrl("/api/a/rbac/bot/app/{app}/{groupId}/count", _req.path)) && _req.method === "GET") {
		if (accessLevel === "Selected" && appsAllowed.indexOf(pathSegment[6]) > -1) return false;
		let mu = _req.user.roles.find(_r => (_r.id.startsWith("PMB") || _r.id.startsWith("PVB")) && _r.app === pathSegment[6] && _r.entity === "USER");
		if (mu) return false;
		let mg = _req.user.roles.find(_r => ["PVGMB", "PMGMBC", "PMGMBD"].indexOf(_r.id) && _r.app === pathSegment[6] && _r.entity === "GROUP");
		if (mg) {
			_req.query.select = "_id,username,basicDetails.name,bot";
			return false;
		}
		return true;
	}

	if ((authUtil.compareUrl("/api/a/rbac/usr/app/{app}/distinctAttributes", _req.path)) && _req.method === "GET") {
		if (accessLevel === "Selected" && appsAllowed.indexOf(pathSegment[6]) > -1) return false;
		let mu = _req.user.roles.find(_r => (_r.id.startsWith("PMU") || _r.id.startsWith("PVU")) && _r.app === pathSegment[6] && _r.entity === "USER");
		if (mu) return false;
		return true;
	}

	if ((authUtil.compareUrl("/api/a/rbac/bot/app/{app}", _req.path) || authUtil.compareUrl("/api/a/rbac/bot/app/{app}/count", _req.path)) && _req.method === "GET") {
		if (accessLevel === "Selected" && appsAllowed.indexOf(pathSegment[6]) > -1) return false;
		let mu = _req.user.roles.find(_r => (_r.id.startsWith("PMB") || _r.id.startsWith("PVB")) && _r.app === pathSegment[6] && _r.entity === "USER");
		if (mu) return false;
		let mg = _req.user.roles.find(_r => (authUtil.groupMemberPermArr.indexOf(_r.id) > -1) && _r.app === pathSegment[6] && _r.entity === "GROUP");
		if (mg) {
			_req.query.select = "_id,username,basicDetails.name,bot";
			return false;
		}
		return true;
	}
	if ((authUtil.compareUrl("/api/a/rbac/{app}/group", _req.path) || authUtil.compareUrl("/api/a/rbac/{app}/group/count", _req.path)) && _req.method === "GET") {
		if (accessLevel === "Selected" && (appsAllowed.indexOf(pathSegment[4]) > -1)) return false;
		let mu = _req.user.roles.find(_r => (_r.id == "PMUG" || _r.id == "PMBG") && _r.app === pathSegment[4] && _r.entity === "USER");
		if (mu) return false;
		let mg = _req.user.roles.find(_r => (_r.id.startsWith("PMG") || _r.id.startsWith("PVG")) && _r.app === pathSegment[4] && _r.entity === "GROUP");
		return !mg;
	}
	if (authUtil.compareUrl("/api/a/rbac/usr/{usrId}/addToApps", _req.path)) {
		return !_req.user.isSuperAdmin;
	}
	// if (authUtil.compareUrl('/api/a/rbac/usr/{username}/{app}/import', _req.path)) {
	//     if (accessLevel === 'Selected' && appsAllowed.indexOf(pathSegment[6]) > -1) return false;
	//     return !_req.user.roles.find(_r => (_req.apiDetails.bot ? _r.id === 'PMB' : _r.id === 'PMU') && _r.app === pathSegment[6] && _r.entity === 'USER');
	// }
	if (authUtil.compareUrl("/api/a/rbac/{auth}/search", _req.path)) {
		if (accessLevel === "Selected" && appsAllowed && appsAllowed.length > 0) return false;
		return !_req.user.roles.find(_r => (_r.id === "PMUBCE") && _r.entity === "USER");
	}
	if (authUtil.compareUrl("/api/a/rbac/{auth}/import", _req.path) || authUtil.compareUrl("/api/a/rbac/{auth}/search", _req.path)) {
		let appAdminsFlag = accessLevel == "Selected" && appsAllowed.length > 0;
		let manageUserFlag = _req.user.roles.find(_r => _r.id === "PMUBCE" && _r.entity === "USER");
		return !(appAdminsFlag || manageUserFlag);
	}
	if(authUtil.compareUrl("/api/a/rbac/usr/{id}/password", _req.path) && _req.method === "PUT") {
		return !_req.user._id === pathSegment[5];
	}
	if (_req.path.startsWith("/api/a/rbac/usr") && _req.method === "PUT") {
		let appAdminFlag = accessLevel == "Selected" && _req.apiDetails.app.length > 0 && _req.apiDetails.app.some(_app => appsAllowed.indexOf(_app) > -1);
		let basicField = ["attributes", "basicDetails", "description"];
		let selfField = ["basicDetails", "description"];
		let accessField = ["isActive"];
		let basicChange = basicField.some(_k => fieldChanged(_k, _req));
		let accessChange = accessField.some(_k => fieldChanged(_k, _req));
		let selfChange = selfField.some(_k => fieldChanged(_k, _req));
		let basicUserFlag = _req.user.roles.find(_r => (_req.apiDetails.bot ? _r.id === "PMBBU" : _r.id === "PMUBU") && _r.entity === "USER" && _req.apiDetails.app.indexOf(_r.app) > -1);
		let accessUserFlag = _req.user.roles.find(_r => (_req.apiDetails.bot ? _r.id === "PMBBU" : _r.id === "PMUBU") && _r.entity === "USER" && _req.apiDetails.app.indexOf(_r.app) > -1);
		let selfFlag = pathSegment[5] === _req.user._id;
		let flag = (appAdminFlag || (!basicChange && !accessChange && selfChange && selfFlag));
		if (flag) return false;
		if (basicChange) {
			if (!basicUserFlag) return true;
		}
		if (accessChange) {
			if (!accessUserFlag) return true;
		}
	}
	if (authUtil.compareUrl("/api/a/rbac/config", _req.path) || authUtil.compareUrl("/api/a/rbac/config/{id}", _req.path)) {
		return true;
	}
}
function fieldChanged(field, _req) {
	if (!_req.body[field]) return true;
	if (typeof _req.apiDetails[field] === "object") {
		_.isEqual(JSON.parse(JSON.stringify(_req.apiDetails[field])), JSON.parse(JSON.stringify(_req.body[field])));
	} else {
		_req.apiDetails[field] === _req.body[field];
	}
}
function isMonApiValid(_req) {
	let accessLevel = _req.user.accessControl.accessLevel;
	let appsAdmin = [];
	if (accessLevel == "Selected") {
		appsAdmin = _req.user.accessControl.apps ? _req.user.accessControl.apps.map(obj => obj._id) : [];
	}

	if (authUtil.compareUrl("/api/a/mon/appCenter/{SRVC}/logs", _req.path) || authUtil.compareUrl("/api/a/mon/appCenter/{SRVC}/logs/count", _req.path)) {
		if (_req.user.isSuperAdmin) return true;
		let permissionApp = _req.user.roles.filter(_r => (_r.id === "PVDSAAP") && _r.entity == "SM").map(_r => _r.app);
		return appsAdmin.concat(permissionApp).indexOf(_req.apiDetails.app) >= 0;

	}

	if (authUtil.compareUrl("/api/a/mon/appCenter/{SRVC}/postHook", _req.path) || authUtil.compareUrl("/api/a/mon/appCenter/{SRVC}/postHook/count", _req.path)) {
		if (_req.user.isSuperAdmin) return true;
		let permissionApp = _req.user.roles.filter(_r => (_r.id === "PVDSAPO") && _r.entity == "SM").map(_r => _r.app);
		return appsAdmin.concat(permissionApp).indexOf(_req.apiDetails.app) >= 0;

	}

	if (authUtil.compareUrl("/api/a/mon/appCenter/{SRVC}/preHook", _req.path) || authUtil.compareUrl("/api/a/mon/appCenter/{SRVC}/preHook/count", _req.path)) {
		if (_req.user.isSuperAdmin) return true;
		let permissionApp = _req.user.roles.filter(_r => (_r.id === "PVDSAPR") && _r.entity == "SM").map(_r => _r.app);
		return appsAdmin.concat(permissionApp).indexOf(_req.apiDetails.app) >= 0;
	}

	if (authUtil.compareUrl("/api/a/mon/author/sm/audit", _req.path) || authUtil.compareUrl("/api/a/mon/author/sm/audit/count", _req.path) || authUtil.compareUrl("/api/a/mon/appCenter/{SRVC}/preHook", _req.path)) {
		if (_req.user.isSuperAdmin) return true;
		let permissionApp = _req.user.roles.filter(_r => (_r.id === "PVDSASR") && _r.entity == "SM").map(_r => _r.app);
		return appsAdmin.concat(permissionApp).indexOf(_req.apiDetails.app) >= 0;

	}
}

function isPMapiInvalid(_req) {
	let accessLevel = _req.user.accessControl.accessLevel;
	let pathSegment = _req.path.split("/");
	let secPMApi = ["/pm/{partnerId}/secret/enc", "/pm/{partnerId}/secret/dec/{secretId}", "/pm/{partnerId}/secret/{secretId}"];
	let secPMApiFlag = secPMApi.some(_a => authUtil.compareUrl(`/api/a/sec${_a}`, _req.path));
	if (_req.user.isSuperAdmin) return false;
	let appsAdmin = [];
	if (accessLevel == "Selected") {
		appsAdmin = _req.user.accessControl.apps ? _req.user.accessControl.apps.map(obj => obj._id) : [];
	}
	if (authUtil.compareUrl("/api/a/pm/flow", _req.path) || authUtil.compareUrl("/api/a/pm/flow/count", _req.path) || authUtil.compareUrl("/api/a/pm/flow/status/count", _req.path)) {
		if (_req.method === "GET") {
			let permissionApp = _req.user.roles.filter(_r => (_r.id === "PMPFMBC" || _r.id === "PVPFMB") && _r.entity == "PM").map(_r => _r.app);
			let manageGroupApps = _req.user.roles.filter(_r => (_r.id === "PMGAP" || _r.id === "PVGAP") && _r.entity === "GROUP").map(_r => _r.app);
			let partnerManageTabApps = _req.user.roles.filter(_r => (_r.id === "PMPM") && _r.entity.startsWith("PM")).map(_r => _r.app);
			let exceptionFlow = _req.user.roles.filter(_r => (_r.id === "PMPFMBC" || _r.id === "PMPFMBC" || _r.id === "PVPFMB") && _r.entity.startsWith("FLOW_")).map(_r => _r.entity.substr(5));
			let noFlow = _req.user.roles.filter(_r => (_r.id === "PNFB") && _r.entity.startsWith("FLOW_")).map(_r => _r.entity.substr(5));
			let appList = permissionApp.concat(manageGroupApps).concat(partnerManageTabApps);
			let customFilter = {
				"$and": [
					{
						$or: [
							{ app: { "$in": appsAdmin } },
							{
								$and: [
									{
										$or: [
											{ app: { "$in": appList } },
											{ runningFlow: { $in: exceptionFlow } },
											{ nextFlow: { $in: exceptionFlow } },
											{ _id: { $in: exceptionFlow } }
										]
									},
									{ runningFlow: { $nin: noFlow } },
									{ nextFlow: { $nin: noFlow } },
									{ _id: { $nin: noFlow } }
								]
							}
						]
					}
				]
			};
			if (_req.query.filter) {
				let oldFilter = _req.query.filter;
				customFilter["$and"].push((typeof oldFilter === "object" ? oldFilter : JSON.parse(oldFilter)));
			}
			_req.query.filter = JSON.stringify(customFilter);
			if (appsAdmin.concat(permissionApp).length == 0 && exceptionFlow.length === 0 && manageGroupApps.length > 0) {
				_req.query.select = "_id,name,app,partner,_metadata";
			}
			return false;
		}
		if (_req.method === "POST") {
			let permissionApp = _req.user.roles.filter(_r => (_r.id === "PMPFMBC") && _r.entity === "PM").map(_r => _r.app);
			return appsAdmin.concat(permissionApp).indexOf(_req.body.app) == -1;
		}
	}
	if (authUtil.compareUrl("/api/a/pm/flow/{id}/deploy", _req.path)) {
		let permissionApp = [];
		let allowedPermission = [];
		let appAdminFlag = appsAdmin.indexOf(_req.apiDetails.app) > -1;
		if (appAdminFlag) return false;
		let noPermissionFlow = _req.user.roles.filter(_r => _r.id == "PNPFM" && _r.entity.startsWith("FLOW_")).map(_r => _r.entity.substr(5));
		if (noPermissionFlow.indexOf(pathSegment[5]) > -1) return true;
		if (_req.method === "PUT") {
			allowedPermission = ["PMPFPD"];
		}
		permissionApp = _req.user.roles.filter(_r => (allowedPermission.indexOf(_r.id) > -1) && _r.entity === "PM").map(_r => _r.app);
		let manageGroupApps = _req.user.roles.filter(_r => (_r.id === "PMGAP" || _r.id === "PVGAP") && _r.entity === "GROUP").map(_r => _r.app);
		let appList = permissionApp.concat(manageGroupApps);
		let invalidFlag = appsAdmin.concat(appList).indexOf(_req.apiDetails.app) == -1;
		if (!invalidFlag) return false;
		let roleEntities = _req.apiDetails.relatedFlows.map(_r => `FLOW_${_r}`);
		let allowedFlowPermission = [];
		if (_req.method === "PUT") {
			allowedFlowPermission = ["PMPFMBC", "PMPFMBU", "PVPFM"];
		}
		return !_req.user.roles.find(_r => roleEntities.indexOf(_r.entity) > -1 && allowedFlowPermission.indexOf(_r.id) > -1 && _r.app === _req.apiDetails.app);
	}
	if (authUtil.compareUrl("/api/a/pm/flow/{app}/startAll", _req.path) || authUtil.compareUrl("/api/a/pm/flow/{app}/stopAll", _req.path)) {
		let app = pathSegment[5];
		return !(appsAdmin.indexOf(app) > -1);
	}
	if (authUtil.compareUrl("/api/a/pm/flow/{id}/stop", _req.path) || authUtil.compareUrl("/api/a/pm/flow/{id}/start", _req.path)) {
		let permissionApp = [];
		let allowedPermission = [];
		let appAdminFlag = appsAdmin.indexOf(_req.apiDetails.app) > -1;
		if (appAdminFlag) return false;
		let noPermissionFlow = _req.user.roles.filter(_r => _r.id == "PNPFM" && _r.entity.startsWith("FLOW_")).map(_r => _r.entity.substr(5));
		if (noPermissionFlow.indexOf(pathSegment[5]) > -1) return true;
		if (_req.method === "PUT") {
			allowedPermission = ["PMPFPS"];
		}
		permissionApp = _req.user.roles.filter(_r => (allowedPermission.indexOf(_r.id) > -1) && _r.entity === "PM").map(_r => _r.app);
		let manageGroupApps = _req.user.roles.filter(_r => (_r.id === "PMGAP" || _r.id === "PVGAP") && _r.entity === "GROUP").map(_r => _r.app);
		let appList = permissionApp.concat(manageGroupApps);
		let invalidFlag = appsAdmin.concat(appList).indexOf(_req.apiDetails.app) == -1;
		if (!invalidFlag) return false;
		let roleEntities = _req.apiDetails.relatedFlows.map(_r => `FLOW_${_r}`);
		let allowedFlowPermission = [];
		if (_req.method === "PUT") {
			allowedFlowPermission = ["PMPFMBC", "PMPFMBU", "PVPFM"];
		}
		return !_req.user.roles.find(_r => roleEntities.indexOf(_r.entity) > -1 && allowedFlowPermission.indexOf(_r.id) > -1 && _r.app === _req.apiDetails.app);
	}
	if (authUtil.compareUrl("/api/a/pm/flow/{id}", _req.path) || authUtil.compareUrl("/api/a/pm/flow/{id}/{action}", _req.path)) {
		let permissionApp = [];
		let allowedPermission = [];
		let appAdminFlag = appsAdmin.indexOf(_req.apiDetails.app) > -1;
		if (appAdminFlag) return false;
		let noPermissionFlow = _req.user.roles.filter(_r => _r.id == "PNPFM" && _r.entity.startsWith("FLOW_")).map(_r => _r.entity.substr(5));
		if (noPermissionFlow.indexOf(pathSegment[5]) > -1) return true;
		if (_req.method === "GET") {
			allowedPermission = ["PMPFMBU", "PMPFMBC", "PVPFM"];
		} else if (_req.method === "PUT") {
			allowedPermission = ["PMPFMBU"];
		}
		else if (_req.method === "DELETE") {
			allowedPermission = ["PMPFMBD"];
		}
		permissionApp = _req.user.roles.filter(_r => (allowedPermission.indexOf(_r.id) > -1) && _r.entity === "PM").map(_r => _r.app);
		let manageGroupApps = _req.user.roles.filter(_r => (_r.id === "PMGAP" || _r.id === "PVGAP") && _r.entity === "GROUP").map(_r => _r.app);
		let appList = permissionApp.concat(manageGroupApps);
		let invalidFlag = appsAdmin.concat(appList).indexOf(_req.apiDetails.app) == -1;
		if (!invalidFlag) return false;
		let roleEntities = _req.apiDetails.relatedFlows.map(_r => `FLOW_${_r}`);
		let allowedFlowPermission = [];
		if (_req.method === "GET") {
			allowedFlowPermission = ["PVPFMB", "PMPFMBC", "PMPFMBU"];
		} else if (_req.method === "PUT") {
			allowedFlowPermission = ["PMPFMBU"];
		}
		return !_req.user.roles.find(_r => roleEntities.indexOf(_r.entity) > -1 && allowedFlowPermission.indexOf(_r.id) > -1 && _r.app === _req.apiDetails.app);
	}
	/*
    if (authUtil.compareUrl('/api/a/pm/nanoService', _req.path) || authUtil.compareUrl('/api/a/pm/nanoService/count', _req.path)) {
        if (_req.method === 'GET') {
            let exceptionNS = _req.user.roles.filter(_r => (_r.id === 'PMNSBC' || _r.id === 'PVNSB') && _r.entity.startsWith('NS_')).map(_r => _r.entity.substr(3));
            let nsNotallowed = _req.user.roles.filter(_r => (_r.id === 'PNNSB') && _r.entity.startsWith('NS_')).map(_r => _r.entity.substr(3));
            let permissionApp = _req.user.roles.filter(_r => (_r.id === 'PMNSBC' || _r.id === 'PVNSB') && _r.entity === 'NS').map(_r => _r.app);
            let manageGroupApps = _req.user.roles.filter(_r => (_r.id === 'PMGANS' || _r.id === 'PVGANS') && _r.entity === 'GROUP').map(_r => _r.app);
            let customFilter = {
                '$and': [
                    {
                        $or: [
                            { app: { '$in': appsAdmin.concat(manageGroupApps) } },
                            {
                                $and: [
                                    {
                                        $or: [
                                            { app: { $in: permissionApp } },
                                            { _id: { $in: exceptionNS } }
                                        ]
                                    },
                                    { _id: { $nin: nsNotallowed } }
                                ]
                            }
                        ]
                    }
                ]
            };
            if (_req.query.filter) {
                let oldFilter = _req.query.filter;
                customFilter['$and'].push(typeof oldFilter === 'object' ? oldFilter : JSON.parse(oldFilter));
                // _req.query.filter = JSON.stringify({ '$and': [typeof oldFilter === 'object' ? oldFilter : JSON.parse(oldFilter), { $or: [{ app: { '$in': appsAdmin.concat(permissionApp) } }, { _id: { $in: exceptionNS } }] }, { _id: { $nin: nsNotallowed } }] });
            }
            //  else {
            //     _req.query.filter = { $and: [{ $or: [{ app: { '$in': appsAdmin.concat(permissionApp) } }, { _id: { $in: exceptionNS } }] },] };
            //     _req.query.filter = JSON.stringify(_req.query.filter);
            // }
            _req.query.filter = JSON.stringify(customFilter);
            if (appsAdmin.concat(permissionApp).length == 0 && exceptionNS.length === 0 && manageGroupApps.length > 0) {
                _req.query.select = '_id,name,app,_metadata';
            }
            return false;
        }
        if (_req.method === 'POST') {
            let permissionApp = _req.user.roles.filter(_r => _r.id === 'PMNSBC' && _r.entity === 'NS').map(_r => _r.app);
            return appsAdmin.concat(permissionApp).indexOf(_req.body.app) == -1;
        }
    }
    if (authUtil.compareUrl('/api/a/pm/nanoService/{id}', _req.path)) {
        let permissionApp = [];
        let allowedPermission = [];
        let appAdminFlag = appsAdmin.indexOf(_req.apiDetails.app) > -1;
        if (appAdminFlag) return false;
        let noPermissionNS = _req.user.roles.filter(_r => _r.id == 'PNNSB' && _r.entity.startsWith('NS_')).map(_r => _r.entity.substr(3));
        if (noPermissionNS.indexOf(pathSegment[5]) > -1) return true;
        if (_req.method === 'GET') {
            allowedPermission = ['PVNSB', 'PMNSBC'];
        } else if (_req.method === 'PUT') {
            allowedPermission = ['PMNSBU'];
        }
        else if (_req.method === 'DELETE') {
            allowedPermission = ['PMNSBD'];
        }
        permissionApp = _req.user.roles.filter(_r => (allowedPermission.indexOf(_r.id) > -1) && _r.entity === 'NS').map(_r => _r.app);
        let appPermission = appsAdmin.concat(permissionApp).indexOf(_req.apiDetails.app) == -1;
        if (!appPermission) return false;
        if (_req.method === 'GET') {
            let exceptionNS = _req.user.roles.filter(_r => (_r.id === 'PMNSBU' || _r.id === 'PVNSB') && _r.entity.startsWith('NS_')).map(_r => _r.entity.substr(3));
            return exceptionNS.indexOf(pathSegment[5]) === -1;
        } else if (_req.method === 'PUT') {
            let exceptionNS = _req.user.roles.filter(_r => (_r.id === 'PMNSBU') && _r.entity.startsWith('NS_')).map(_r => _r.entity.substr(3));
            return exceptionNS.indexOf(pathSegment[5]) === -1;
        }
        return true;
    }
    */
	if (authUtil.compareUrl("/api/a/pm/dataFormat", _req.path) || authUtil.compareUrl("/api/a/pm/dataFormat/count", _req.path)) {
		if (_req.method === "GET") {
			let exceptionDF = _req.user.roles.filter(_r => (_r.id === "PMDF" || _r.id === "PVDF") && _r.entity.startsWith("DF_")).map(_r => _r.entity.substr(3));
			let dfNotallowed = _req.user.roles.filter(_r => (_r.id === "PNDF") && _r.entity.startsWith("DF_")).map(_r => _r.entity.substr(3));
			let permissionApp = _req.user.roles.filter(_r => (_r.id === "PMDF" || _r.id === "PVDF") && _r.entity === "DF").map(_r => _r.app);
			let manageGroupApps = _req.user.roles.filter(_r => (_r.id === "PMGADF" || _r.id === "PVGADF") && _r.entity === "GROUP").map(_r => _r.app);
			let customFilter = {
				"$and": [
					{
						$or: [
							{ app: { "$in": appsAdmin.concat(manageGroupApps) } },
							{
								$and: [
									{
										$or: [
											{ app: { $in: permissionApp } },
											{ _id: { $in: exceptionDF } }
										]
									},
									{ _id: { $nin: dfNotallowed } }
								]
							}
						]
					}
				]
			};
			if (_req.query.filter) {
				let oldFilter = _req.query.filter;
				customFilter["$and"].push(typeof oldFilter === "object" ? oldFilter : JSON.parse(oldFilter));
				// _req.query.filter = JSON.stringify({ '$and': [typeof oldFilter === 'object' ? oldFilter : JSON.parse(oldFilter), { $or: [{ app: { '$in': appsAdmin.concat(permissionApp) } }, { _id: { $in: exceptionDF } }] }, { _id: { $nin: dfNotallowed } }] });
			}
			//  else {
			//     _req.query.filter = { $and: [{ $or: [{ app: { '$in': appsAdmin.concat(permissionApp) } }, { _id: { $in: exceptionDF } }] }, { _id: { $nin: dfNotallowed } }] };
			//     _req.query.filter = JSON.stringify(_req.query.filter);
			// }
			_req.query.filter = JSON.stringify(customFilter);
			if (appsAdmin.concat(permissionApp).length == 0 && exceptionDF.length === 0 && manageGroupApps.length > 0) {
				_req.query.select = "_id,name,app,_metadata";
			}
			return false;
		}
		if (_req.method === "POST") {
			let permissionApp = _req.user.roles.filter(_r => _r.id === "PMDF" && _r.entity === "DF").map(_r => _r.app);
			return appsAdmin.concat(permissionApp).indexOf(_req.body.app) == -1;
		}
	}
	if (authUtil.compareUrl("/api/a/pm/dataFormat/{id}", _req.path)) {
		let permissionApp = [];
		let allowedPermission = [];
		let appAdminFlag = appsAdmin.indexOf(_req.apiDetails.app) > -1;
		if (appAdminFlag) return false;
		if (_req.method === "GET") {
			allowedPermission = ["PMDF", "PVDF"];
		} else if (_req.method === "PUT" || _req.method === "DELETE") {
			allowedPermission = ["PMDF"];
		}
		permissionApp = _req.user.roles.filter(_r => (allowedPermission.indexOf(_r.id) > -1) && _r.entity === "DF").map(_r => _r.app);
		let appFlag = appsAdmin.concat(permissionApp).indexOf(_req.apiDetails.app) == -1;
		if (!appFlag) return false;
		if (_req.method === "GET") {
			let exceptionDF = _req.user.roles.filter(_r => (_r.id === "PMDF" || _r.id === "PVDF") && _r.entity.startsWith("DF_")).map(_r => _r.entity.substr(3));
			return exceptionDF.indexOf(pathSegment[5]) === -1;
		} else if (_req.method === "PUT") {
			let exceptionDF = _req.user.roles.filter(_r => (_r.id === "PMDF") && _r.entity.startsWith("DF_")).map(_r => _r.entity.substr(3));
			return exceptionDF.indexOf(pathSegment[5]) === -1;
		}
		return true;
	}
	if (authUtil.compareUrl("/api/a/pm/agentRegistry", _req.path) || authUtil.compareUrl("/api/a/pm/agentRegistry/count", _req.path)) {
		if (_req.method === "GET") {
			let permissionApp = _req.user.roles.filter(_r => (_r.id === "PMABC" || _r.id === "PMABU" || _r.id === "PVAB") && _r.entity == "AGENT").map(_r => _r.app);
			let manageGroupApps = _req.user.roles.filter(_r => (_r.id === "PMGAP" || _r.id === "PVGAP") && _r.entity === "GROUP").map(_r => _r.app);
			let exceptionAgent = _req.user.roles.filter(_r => (_r.id === "PMABC" || _r.id === "PMABU" || _r.id === "PVAB") && _r.entity.startsWith("AGENT_")).map(_r => _r.entity.substr(6));
			let noAgent = _req.user.roles.filter(_r => (_r.id === "PNAB") && _r.entity.startsWith("AGENT_")).map(_r => _r.entity.substr(6));
			let appList = permissionApp.concat(manageGroupApps);
			let customFilter = {
				"$and": [
					{
						$or: [
							{ app: { "$in": appsAdmin } },
							{
								$and: [
									{
										$or: [
											{ app: { "$in": appList } },
											{ _id: { $in: exceptionAgent } }
										]
									},
									{ _id: { $nin: noAgent } }
								]
							}
						]
					}
				]
			};
			if (_req.query.filter) {
				let oldFilter = _req.query.filter;
				customFilter["$and"].push((typeof oldFilter === "object" ? oldFilter : JSON.parse(oldFilter)));
			}
			_req.query.filter = JSON.stringify(customFilter);
			if (appsAdmin.concat(permissionApp).length == 0 && exceptionAgent.length === 0 && manageGroupApps.length > 0) {
				_req.query.select = "_id,name,app,partner,_metadata";
			}
			return false;
		}
		if (_req.method === "POST") {
			let permissionApp = _req.user.roles.filter(_r => _r.id === "PMABC" && _r.entity === "AGENT").map(_r => _r.app);
			return appsAdmin.concat(permissionApp).indexOf(_req.body.app) == -1;
		}
	}
	if (authUtil.compareUrl("/api/a/pm/agentMonitoring", _req.path) || authUtil.compareUrl("/api/a/pm/agentMonitoring/count", _req.path)) {
		if (_req.method === "GET") {
			let permissionApp = _req.user.roles.filter(_r => (_r.id === "PMABC" || _r.id === "PMABU" || _r.id === "PVAB") && _r.entity == "AGENT").map(_r => _r.app);
			let manageGroupApps = _req.user.roles.filter(_r => (_r.id === "PMGAP" || _r.id === "PVGAP") && _r.entity === "GROUP").map(_r => _r.app);
			let exceptionAgent = _req.user.roles.filter(_r => (_r.id === "PMABC" || _r.id === "PMABU" || _r.id === "PVAB") && _r.entity.startsWith("AGENT_")).map(_r => _r.entity.substr(6));
			let noAgent = _req.user.roles.filter(_r => (_r.id === "PNAB") && _r.entity.startsWith("AGENT_")).map(_r => _r.entity.substr(6));
			let appList = permissionApp.concat(manageGroupApps);
			let customFilter = {
				"$and": [
					{
						$or: [
							{ app: { "$in": appsAdmin } },
							{
								$and: [
									{
										$or: [
											{ app: { "$in": appList } },
											{ _id: { $in: exceptionAgent } }
										]
									},
									{ _id: { $nin: noAgent } }
								]
							}
						]
					}
				]
			};
			if (_req.query.filter) {
				let oldFilter = _req.query.filter;
				customFilter["$and"].push((typeof oldFilter === "object" ? oldFilter : JSON.parse(oldFilter)));
			}
			_req.query.filter = JSON.stringify(customFilter);
			if (appsAdmin.concat(permissionApp).length == 0 && exceptionAgent.length === 0 && manageGroupApps.length > 0) {
				_req.query.select = "_id,name,app,partner,_metadata";
			}
			return false;
		}
	}
	if (authUtil.compareUrl("/api/a/pm/agentRegistry/{id}/password", _req.path)) {
		let permissionApp = [];
		let allowedPermission = [];
		if (_req.method === "GET") {
			allowedPermission = ["PVAPW"];
		} else if (_req.method === "PUT") {
			allowedPermission = ["PMAPW"];
		}
		let id = pathSegment[5];
		let exceptionFlag = _req.user.roles.find(_r => (allowedPermission.indexOf(_r.id) > -1) && _r.entity === `AGENT_${id}`);
		if (exceptionFlag) return false;
		permissionApp = _req.user.roles.filter(_r => (allowedPermission.indexOf(_r.id) > -1) && _r.entity === "AGENT").map(_r => _r.app);
		return appsAdmin.concat(permissionApp).indexOf(_req.apiDetails.app) == -1;
	}
	if (authUtil.compareUrl("/api/a/pm/agentRegistry/{id}/enable", _req.path) || authUtil.compareUrl("/api/a/pm/agentRegistry/{id}/disable", _req.path)) {
		let permissionApp = [];
		let allowedPermission = [];
		if (_req.method === "PUT") {
			allowedPermission = ["PMAEN"];
		}
		let id = pathSegment[5];
		let exceptionFlag = _req.user.roles.find(_r => (allowedPermission.indexOf(_r.id) > -1) && _r.entity === `AGENT_${id}`);
		if (exceptionFlag) return false;
		permissionApp = _req.user.roles.filter(_r => (allowedPermission.indexOf(_r.id) > -1) && _r.entity === "AGENT").map(_r => _r.app);
		return appsAdmin.concat(permissionApp).indexOf(_req.apiDetails.app) == -1;
	}
	if (authUtil.compareUrl("/api/a/pm/agentRegistry/{id}", _req.path)) {
		let permissionApp = [];
		let allowedPermission = [];
		if (_req.method === "GET") {
			allowedPermission = ["PVAB"];
		} else if (_req.method === "PUT") {
			allowedPermission = ["PMABU"];
		}
		else if (_req.method === "DELETE") {
			allowedPermission = ["PMABD"];
		}
		let id = pathSegment[5];
		let exceptionFlag = _req.user.roles.find(_r => (allowedPermission.indexOf(_r.id) > -1) && _r.entity === `AGENT_${id}`);
		if (exceptionFlag) return false;
		permissionApp = _req.user.roles.filter(_r => (allowedPermission.indexOf(_r.id) > -1) && _r.entity === "AGENT").map(_r => _r.app);
		return appsAdmin.concat(permissionApp).indexOf(_req.apiDetails.app) == -1;
	}
	if (authUtil.compareUrl("/api/a/pm/{app}/interaction", _req.path) || authUtil.compareUrl("/api/a/pm/{app}/interaction/count", _req.path) || authUtil.compareUrl("/api/a/pm/{app}/interactionBlock", _req.path) || authUtil.compareUrl("/api/a/pm/{app}/interactionBlock/count", _req.path)) {
		if (_req.method === "GET") {
			let permissionFlow = _req.user.roles.filter(_r => (_r.id === "PVI") && _r.entity.startsWith("INTR_")).map(_r => _r.entity.substr(5));
			let intrNoPermission = _req.user.roles.filter(_r => (_r.id === "PNI") && _r.entity.startsWith("INTR_")).map(_r => _r.entity.substr(5));
			let agentPermissionApp = _req.user.roles.filter(_r => (["PMA", "PVA"].indexOf(_r.id) > -1) && _r.entity === "AGENT").map(_r => _r.app);
			if (permissionFlow.length == 0) {
				if(agentPermissionApp.includes(pathSegment[4]))
					_req.query.select = "status,_metadata";
				else
					return true;
			} else {
				if (_req.query.filter) {
					let oldFilter = _req.query.filter;
					_req.query.filter = JSON.stringify({ "$and": [(typeof oldFilter === "object" ? oldFilter : JSON.parse(oldFilter)), { flowId: { "$in": permissionFlow } }, { flowId: { $nin: intrNoPermission } }] });
				} else {
					_req.query.filter = JSON.stringify({ flowId: { "$in": permissionFlow } });
				}
			}

			logger.debug(`[${_req.headers.TxnId}] _req.query.filter :: ${JSON.stringify(_req.query.filter)}`);
			return false;
		}
	}
	if (authUtil.compareUrl("/api/a/pm/{app}/download/{agentType}/{id}/{type}", _req.path) || authUtil.compareUrl("/api/a/pm/{app}/interaction/redownloadFile", _req.path)) {
		if (authUtil.compareUrl("/api/a/pm/{app}/download/{agentType}/{id}/{type}", _req.path)) {
			let id = pathSegment[7];
			let exceptionFlag = _req.user.roles.find(_r => (["PMADL"].indexOf(_r.id) > -1) && _r.entity === `AGENT_${id}`);
			if (exceptionFlag) return false;
		}
		let permissionApp = _req.user.roles.filter(_r => _r.id === "PMADL" && _r.entity === "AGENT").map(_r => _r.app);
		return appsAdmin.concat(permissionApp).indexOf(pathSegment[4]) == -1;
	}
	if (authUtil.compareUrl("/api/a/pm/ieg/download/{type}", _req.path) || authUtil.compareUrl("/api/a/pm/agentRegistry/IEG/password", _req.path)) {
		return true;
	}
	if (authUtil.compareUrl("/api/a/pm/flow/{app}/startAll", _req.path) || authUtil.compareUrl("/api/a/pm/flow/{app}/stopAll", _req.path)) {
		return appsAdmin.indexOf(pathSegment[5]) === -1;
	}
	if (authUtil.compareUrl("/api/a/pm/{app}/partner/{partnerid}/startAll", _req.path) || authUtil.compareUrl("/api/a/pm/{app}/partner/{partnerid}/stopAll", _req.path)) {
		let app = pathSegment[4];
		if(appsAdmin.includes(app)) return false;
		return !_req.user.roles.some(_r => _r.id === "PMPM" && _r.entity === "PM" && _r.app === app);
	}
	if (secPMApiFlag) {
		let permissionApp = [];
		let allowedPermission = [];
		let appAdminFlag = appsAdmin.indexOf(_req.apiDetails.app) > -1;
		if (appAdminFlag) return false;
		if (_req.method === "GET") {
			allowedPermission = ["PMPP", "PVPP"];
		} else if (_req.method === "PUT" || _req.method === "DELETE" || _req.method === "POST") {
			allowedPermission = ["PMPP"];
		}
		permissionApp = _req.user.roles.filter(_r => (allowedPermission.indexOf(_r.id) > -1) && _r.entity === "PM").map(_r => _r.app);
		let appFlag = appsAdmin.concat(permissionApp).indexOf(_req.apiDetails.app) == -1;
		if (!appFlag) return false;
		if (_req.method === "GET") {
			let exceptionPM = _req.user.roles.filter(_r => (_r.id === "PMPP" || _r.id === "PVPP") && _r.entity.startsWith("PM_")).map(_r => _r.entity.substr(3));
			return exceptionPM.indexOf(pathSegment[5]) === -1;
		} else if (["PUT", "POST", "DELETE"].indexOf(_req.method) > -1) {
			let exceptionPM = _req.user.roles.filter(_r => (_r.id === "PMPP") && _r.entity.startsWith("PM_")).map(_r => _r.entity.substr(3));
			return exceptionPM.indexOf(pathSegment[5]) === -1;
		}
		return true;
	}
}

function isWorkflowInvalid(_req) {
	if (_req.user.isSuperAdmin) return false;
	let pathSegment = _req.path.split("/");
	_req.user.roles = _req.user.roles.filter(r => r.entity);
	if (authUtil.compareUrl("/api/a/workflow/serviceList", _req.path)) {
		logger.debug(`[${_req.headers.TxnId}] ${JSON.stringify("_req.user.roles -- ", _req.user.roles)}`);
		let serviceList = _req.user.roles.filter(_r => _r.type == "appcenter" && !(_r.entity.startsWith("INTR") || _r.entity.startsWith("BM_"))).map(_r => _r.entity);
		if (_req.query.filter) {
			let oldFilter = _req.query.filter;
			_req.query.filter = JSON.stringify({ "$and": [typeof oldFilter === "object" ? oldFilter : JSON.parse(oldFilter), { serviceId: { "$in": serviceList } }] });
		} else {
			_req.query.filter = JSON.stringify({ serviceId: { "$in": serviceList } });
		}
		return false;
	}
	if (authUtil.compareUrl("/api/a/workflow", _req.path) || authUtil.compareUrl("/api/a/workflow/count", _req.path)) {
		if (_req.method === "GET") {
			let serviceList = _req.user.roles.filter(_r => _r.type == "appcenter" && !(_r.entity.startsWith("INTR") || _r.entity.startsWith("BM_"))).map(_r => _r.entity);
			if (_req.query.filter) {
				let oldFilter = _req.query.filter;
				_req.query.filter = JSON.stringify({ "$and": [typeof oldFilter === "object" ? oldFilter : JSON.parse(oldFilter), { serviceId: { "$in": serviceList } }] });
			} else {
				_req.query.filter = JSON.stringify({ serviceId: { "$in": serviceList } });
			}
			return false;
		}
		if (_req.method === "POST") {
			return true;
		}
	}
	if (authUtil.compareUrl("/api/a/workflow/action", _req.path)) {
		let serviceList = _req.apiDetails.manageServiceList;
		let reqServiceList = _req.apiDetails.map(_a => _a.serviceId);
		logger.debug(`[${_req.headers.TxnId}] ${JSON.stringify({ serviceList, reqServiceList })}`);
		return !reqServiceList.every(_s => serviceList.indexOf(_s) > -1);
	}
	if (authUtil.compareUrl("/api/a/workflow/{id}", _req.path) || authUtil.compareUrl("/api/a/workflow/doc/{id}", _req.path)) {
		let serviceList = [];
		if (_req.method === "GET")
			serviceList = _req.user.roles.filter(_r => _r.type == "appcenter" && _r.entity.startsWith("SRVC")).map(_r => _r.entity);
		else {
			serviceList = _req.apiDetails.manageServiceList;
		}
		return serviceList.indexOf(_req.apiDetails.serviceId) === -1;
	}
	if (authUtil.compareUrl("/api/a/workflow/group/{app}", _req.path)) {
		let appList = _req.user.roles.filter(_r => _r.type == "appcenter" && _r.entity.startsWith("SRVC")).map(_r => _r.app);
		return appList.indexOf(pathSegment[5]) === -1;
	}
}


/*function isAllowedToRedeploy(_req, highestPermission) {
    let apiList = ['deploy', 'start', 'stop', '/purge/all', '/purge/log', '/purge/audit', 'repair', 'draftDelete'];
    return ((_req.method === 'PUT' || _req.method === 'DELETE') && (apiList.some(_a => _req.path.endsWith(_a))) && (highestPermission['fields']['status'] && highestPermission['fields']['status']['_p'] === 'W'));
}*/

// function isRolesCheckNeeded(req) {
//     if (req.method === 'GET') return false;
//     let urlList = ['/api/a/rbac/group', '/api/a/rbac/group/{grpId}'];
//     return urlList.some(_r => authUtil.compareUrl(_r, req.path));
// }

function checkPermissionsSM(relatedPermissions, userPermission, reqEntity, sMType, reqApp, _req) {

	let isAdminUser = _req.user && _req.user.isSuperAdmin ? true : false;
	if (isAdminUser) return true;
	// _req.apiDetails = { app: reqApp };

	let accessLevel = _req.user.accessControl ? _req.user.accessControl.accessLevel : null;
	let appsAllowed = null;

	if (accessLevel == "Selected") {
		appsAllowed = _req.user.accessControl.apps ? _req.user.accessControl.apps.map(obj => obj._id) : [];
	}
	if (accessLevel === "Selected" && appsAllowed.indexOf(reqApp) > -1) {
		return true;
	}

	let result = false;
	if (_req.path.endsWith("start") || _req.path.endsWith("stop")) {
		let allowedPermission = ["PMDSPS"];
		let service = _req.path.split("/")[4];
		let expFlag = [];
		expFlag = _req.user.roles.filter(_r => _r.entity === ("SM_" + service));
		let normalPermission = _req.user.roles.filter(_r => !_r.entity.startsWith("SM_"));
		if (expFlag.length > 0) {
			expFlag.forEach(perm => {
				normalPermission.push(perm);
			});
		}
		allowedPermission.forEach(perm => {
			normalPermission.forEach(perms => {
				if (perms.id == perm) {
					result = true;
				}
			});
		});
		if (!result) {
			return result;
		}
	}

	if (_req.path.endsWith("deploy") || _req.path.endsWith("repair")) {
		let allowedPermission = ["PMDSPD"];
		let service = _req.path.split("/")[4];
		let expFlag = [];
		expFlag = _req.user.roles.filter(_r => _r.entity === ("SM_" + service));
		let normalPermission = _req.user.roles.filter(_r => !_r.entity.startsWith("SM_"));
		if (expFlag.length > 0) {
			expFlag.forEach(perm => {
				normalPermission.push(perm);
			});
		}
		allowedPermission.forEach(perm => {
			normalPermission.forEach(perms => {
				if (perms.id == perm) {
					result = true;
				}
			});
		});
		if (!result) {
			return result;
		}
	}

	if (_req.path.endsWith("/purge/all") || _req.path.endsWith("/purge/audit") || _req.path.endsWith("/purge/log") || _req.path.endsWith("/purge/author-audit")) {
		let allowedPermission = ["PMDSSRE"];
		let service = _req.path.split("/")[4];
		let expFlag = [];
		expFlag = _req.user.roles.filter(_r => _r.entity === ("SM_" + service));
		let normalPermission = _req.user.roles.filter(_r => !_r.entity.startsWith("SM_"));
		if (expFlag.length > 0) {
			expFlag.forEach(perm => {
				normalPermission.push(perm);
			});
		}
		allowedPermission.forEach(perm => {
			normalPermission.forEach(perms => {
				if (perms.id == perm) {
					result = true;
				}
			});
		});
		if (!result) {
			return result;
		}
	}

	if (_req.path.endsWith("draftDelete")) {
		let allowedPermission = ["PMDSBD"];
		let service = _req.path.split("/")[4];
		let expFlag = [];
		expFlag = _req.user.roles.filter(_r => _r.entity === ("SM_" + service));
		let normalPermission = _req.user.roles.filter(_r => !_r.entity.startsWith("SM_"));
		if (expFlag.length > 0) {
			expFlag.forEach(perm => {
				normalPermission.push(perm);
			});
		}
		allowedPermission.forEach(perm => {
			normalPermission.forEach(perms => {
				if (perms.id == perm) {
					result = true;
				}
			});
		});
		if (!result) {
			return result;
		}
	}


	logger.debug(`[${_req.headers.TxnId}] ${JSON.stringify({ relatedPermissions, userPermission, reqEntity, sMType, reqApp })}`);
	let expEntityId = Array.isArray(reqEntity) && reqEntity.find(_rE => _rE.startsWith(sMType + "_"));
	let expFlag = expEntityId && Array.isArray(reqEntity) && userPermission.find(_usrP => _usrP.entity === expEntityId);
	let allPermission = null;
	let allowedUserPermission = null;
	allPermission = expFlag ? relatedPermissions.find(_rlP => _rlP.entity === expEntityId) : relatedPermissions.find(_rlP => _rlP.entity !== expEntityId);
	allowedUserPermission = _req.user.roles.filter(_r => (_r.app === allPermission.app) && (_r.entity === allPermission.entity)).map(_o => _o.id);
	allPermission.fields = JSON.parse(allPermission.fields);
	logger.debug(`[${_req.headers.TxnId}] ${JSON.stringify({ allowedUserPermission, allPermission })}`);
	let highestPermissionObject = authUtil.computeMethodAllowed(allowedUserPermission, allPermission, isAdminUser);
	logger.debug(`[${_req.headers.TxnId}] ${JSON.stringify({ highestPermissionObject })}`);
	let highestPermission = highestPermissionObject.find(_hpo => _hpo.method === _req.method);
	logger.debug(`[${_req.headers.TxnId}] ${JSON.stringify({ highestPermission })}`);
	if (!highestPermission) return false;

	return highestPermission ? authUtil.checkPermission(highestPermission.fields, ["W"], _req.body) : false;
	// let result = relatedPermissions.every(allPermission => {
	//     userPermission = _req.user.roles.filter(_r => (_r.app === allPermission.app) && (_r.entity === allPermission.entity)).map(_o => _o.id);
	//     let flag = false;
	//     allPermission.fields = JSON.parse(allPermission.fields);
	//     let highestPermissionObject = authUtil.computeMethodAllowed(userPermission, allPermission, isAdminUser);
	//     // let getObj = _.remove(highestPermissionObject, _d => _d.method === 'GET');
	//     // _req._highestPermission = highestPermissionObject.concat(getObj);
	//     let highestPermission = highestPermissionObject.find(_hpo => _hpo.method === _req.method);
	//     if (!highestPermission) return true;
	//     if (isAllowedToRedeploy(_req, highestPermission)) {
	//         flag = true;
	//     }
	//     let isAllowed = highestPermission ? authUtil.checkPermission(highestPermission.fields, ['W'], _req.body) : false;
	//     if (isAllowed) {
	//         flag = true;
	//     }
	//     return !flag;
	// });
	// return !result;
}

function createServiceObject(reqBody, data) {
	let retObj = JSON.parse(JSON.stringify(reqBody));
	Object.keys(data).forEach(key => {
		if (reqBody[key] || reqBody[key] === false || reqBody[key] === 0) {
			retObj[key] = reqBody[key];
		} else {
			retObj[key] = data[key];
		}
	});
	return retObj;
}

e.getAuthzMiddleware = (permittedUrls) => {
	logger.debug("getAuthzMiddleware");
	return (_req, _res, next) => {
		if (_req.path.startsWith("/api/a/mon/ui/logs") && _req.body) {
			_req.body.userId = _req.user._id;
		}
		if ((authUtil.compareUrl("/api/a/sm/service/{srvcId}", _req.path) || authUtil.compareUrl("/api/a/sm/service", _req.path) || authUtil.compareUrl("/api/a/sm/globalSchema/{id}", _req.path) || authUtil.compareUrl("/api/a/sm/globalSchema", _req.path))) {
			if (_req.query.select) {
				logger.debug(`e.getAuthzMiddleware :: _req.query.select : ${JSON.stringify(_req.query.select)}`);
				_req.query.select = authUtil.addSelect(["app"], _req.query.select);
			}
		}
		if (authUtil.isUrlPermitted(permittedUrls, _req)) {
			return next();
		}
		try {
			if (isAccessControlInvalid(_req)) {
				_res.status(403).json({ message: "Access denied" });
				return next(new Error("Access denied"));
			}
		} catch (err) {
			next(err);
		}
		if (isPMapiInvalid(_req)) {
			_res.status(403).json({ message: "Access denied" });
			return next(new Error("Access denied"));
		}
		if (isMonApiValid(_req)) {
			return next();
		}
		if (isWorkflowInvalid(_req)) {
			_res.status(403).json({ message: "Access denied" });
			return next(new Error("Access denied"));
		}
		if (_req.path.startsWith("/api/a/sec/keys")) {
			if (_req.user.isSuperAdmin) {
				return next();
			} else {
				_res.status(403).json({ message: "Access denied" });
				return next(new Error("Access denied"));
			}
		}
		if (_req.path.startsWith("/api/a/workflow")) {
			return authUtil.checkRecordPermissionForUserWF(_req)
				.then(() => {
					return next();
				})
				.catch(err => {
					logger.error(err);
					next(err);
				});
		}
		if (authUtil.isUrlPermitted(["/api/a/rbac", "/api/a/workflow"], _req)) {
			return next();
		}
		let splitUrl = _req.path.split("/");
		if (_req.path.startsWith("/api/a/pm") && splitUrl[4] !== "partner" && splitUrl[4] != "nanoService") {
			return next();
		}
		if (_res.headersSent) return;
		let authObject = authLogic.find(obj => {
			return _req.path.startsWith(obj.url);
		});

		if (!authObject) {
			return _res.status(401).json({
				message: "Url not configured in authorization"
			});
		} else {
			let apps = _req.user.apps.map(obj => obj._id);
			logger.debug(`Apps: ${apps.join(", ")}`);
			let highestPermission = null;
			// let perm = [];
			let reqApp = null;
			let reqEntity = null;
			logger.debug(authObject);
			authObject.getApp(_req)
				.then(_d => {
					logger.debug("After auth object");
					logger.debug(_d);
					if (_d instanceof Error) throw _d;
					reqApp = _d;
					if (reqApp && apps.indexOf(reqApp) == -1) {
						_res.status(403).json({
							message: reqApp + " app is restricted"
						});
						throw new Error(reqApp + " app is restricted");
					}
					// // To fetch all the permission id the user has for a app.
					// if (_req.user.roles && Array.isArray(_req.user.roles))
					//     perm = [].concat.apply([], _req.user.roles.filter(_r => (reqApp ? _r.app === reqApp : true) && _r.permissions && Array.isArray(_r.permissions)).map(obj => obj.permissions.map(_p => _p.name)));
				}, _d => {
					_res.status(404).json({ message: _d.message });
					next(new Error(_d));
					return;
				})
				.then(() => authObject.getEntity(_req))
				.then(entity => {
					reqEntity = entity;
					logger.debug({ reqEntity });
					if (!entity) {
						sendForbidden(_res);
						return;
					}
					if (reqEntity == "SEC") return [];
					return authUtil.getPermissions(_req, entity, reqApp);
				})
				.then(_p => {
					if (reqEntity == "SEC") return next();
					if (_p) {
						let userPermissionIds = [];
						// To fetch all the permission id the user has for a app and entity.
						if (_req.user.roles && Array.isArray(_req.user.roles)) {
							userPermissionIds = _req.user.roles.filter(_r => (reqApp ? _r.app === reqApp : true) && (Array.isArray(reqEntity) ? reqEntity.indexOf(_r.entity) > -1 : _r.entity === reqEntity)).map(_o => _o.id);
							logger.debug(`Permission Ids :: ${userPermissionIds.join(", ")}`);
						}
						if ((Array.isArray(reqEntity) && reqEntity.indexOf("SM") > -1) || reqEntity === "SM") {
							let flag = checkPermissionsSM(_p, _req.user.roles, reqEntity, "SM", reqApp, _req);
							logger.debug({ flag });
							if (flag) {
								if (authUtil.compareUrl("/api/a/sm/service/{Id}", _req.path) && _req.method === "PUT") {
									_req.body = createServiceObject(_req.body, _req.apiDetails);
								}
								next(); return;
							} else {
								sendForbidden(_res);
								return;
							}
						}
						if ((Array.isArray(reqEntity) && reqEntity.indexOf("GS") > -1) || reqEntity === "GS") {
							let flag = checkPermissionsSM(_p, _req.user.roles, reqEntity, "GS", reqApp, _req);
							logger.debug({ flag });
							if (flag) {
								next(); return;
							} else {
								sendForbidden(_res);
								return;
							}
						}
						if ((Array.isArray(reqEntity) && reqEntity.indexOf("PM") > -1) || reqEntity === "PM") {
							let manageGroupApps = _req.user.roles.filter(_r => (_r.id === "PMGAP" || _r.id === "PVGAP") && _r.entity === "GROUP").map(_r => _r.app);
							if ((manageGroupApps.indexOf(reqApp) > -1) && _req.method === "GET") {
								next();
								return;
							}
							let flag = checkPermissionsSM(_p, _req.user.roles, reqEntity, "PM", reqApp, _req);
							logger.debug({ flag });
							if (flag) {
								next(); return;
							} else {
								sendForbidden(_res);
								return;
							}
						}

						if ((Array.isArray(reqEntity) && reqEntity.indexOf("NS") > -1) || reqEntity === "NS") {
							let manageGroupApps = _req.user.roles.filter(_r => (_r.id === "PMGAP" || _r.id === "PVGAP") && _r.entity === "GROUP").map(_r => _r.app);
							if ((manageGroupApps.indexOf(reqApp) > -1) && _req.method === "GET") {
								next();
								return;
							}
							let flag = checkPermissionsSM(_p, _req.user.roles, reqEntity, "NS", reqApp, _req);
							logger.debug({ flag });
							if (flag) {
								next(); return;
							} else {
								sendForbidden(_res);
								return;
							}
						}

						let allPermission = _p[0];
						logger.debug(JSON.stringify({ allPermission }));
						if (!allPermission) {
							sendForbidden(_res);
							return;
						}
						allPermission.fields = (typeof (allPermission.fields) == "object") ? allPermission.fields : JSON.parse(allPermission.fields);
						let urlArr = _req.path.split("/");
						let isAdminUser = _req.user && _req.user.isSuperAdmin ? true : false;
						let highestPermissionObject = authUtil.computeMethodAllowed(userPermissionIds, allPermission, isAdminUser);
						let getObj = _.remove(highestPermissionObject, _d => _d.method === "GET");
						_req._highestPermission = highestPermissionObject.concat(getObj);
						if (urlArr[5] && urlArr[5] === "fileMapper") {
							_req.entityPermission = _p[0];
							_req.userPermissionIds = userPermissionIds;
							return next();
						}
						let permissionAllowed = highestPermissionObject.map(_h => _h.method);
						logger.debug(JSON.stringify({ permissionAllowed }));
						if (authUtil.compareUrl("/api/c/{app}/{api}/utils/aggregate", _req.path)) {
							if (_req.body) {
								if (permissionAllowed.length === 0) {
									logger.debug("fields " + JSON.stringify(getObj[0].fields));
									let fields = authUtil.flattenPermission(getObj[0].fields, "", ["W", "R"]);
									let projection = fields.reduce((acc, curr) => {
										acc[curr] = 1;
										return acc;
									}, {});
									let query = { "$project": projection };
									if (Array.isArray(_req.body)) {
										_req.body.unshift(query);
									} else {
										_req.body = [query, _req.body];
									}
									logger.debug("Updated body " + JSON.stringify(_req.body));
								}
								if (!_req.user.isSuperAdmin)
									return authUtil.checkRecordPermissionForUserCRUD(userPermissionIds, allPermission, _req.method, "API", _req.body, _req).then(() => next());
								else 
									return next();
							}

						}
						if (permissionAllowed.indexOf(_req.method) > -1) {
							if (!_req.user.isSuperAdmin)
								return authUtil.checkRecordPermissionForUserCRUD(userPermissionIds, allPermission, _req.method, "API", _req.body, _req).then(() => next());
							else next();
						} else {
							let paths = _req.path.split("/");
							if (_req.method == "GET" || (_req.method == "POST" && (paths[6] == "simulate" || paths[6] == "experienceHook"))) {
								if (permissionAllowed.length > 0) {
									if (!_req.user.isSuperAdmin)
										return authUtil.checkRecordPermissionForUserCRUD(userPermissionIds, allPermission, _req.method, "API", _req.body, _req).then(() => next());
									else next();
								} else {
									highestPermission = getObj[0].fields;
									logger.debug(JSON.stringify({ highestPermission }));
									if (!highestPermission || _.isEmpty(highestPermission)) {
										sendForbidden(_res);
										return;
									}
									if (!authUtil.hasAnyReadPermission(highestPermission)) {
										sendForbidden(_res);
										return;
										// next(new Error("Not Permitted"));
									}
									if (!_req.user.isSuperAdmin)
										return authUtil.checkRecordPermissionForUserCRUD(userPermissionIds, allPermission, _req.method, "API", _req.body, _req).then(() => next());
									else next();
								}
							} else {
								logger.error("returning from here");
								sendForbidden(_res);
							}
						}
					}
				})
				.catch(err => {
					logger.error(err);
					next(err);
				});
		}
	};
};

module.exports = e;