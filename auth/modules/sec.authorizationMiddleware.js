let authUtil = require("./../../util/authUtil");
let commonAuthZMw = require("./common.authorizationMiddleware");

function isSecAccessControlInvalid(req) {
    logger.debug("Checking sec auth");
	let accessLevel = req.user.accessControl.accessLevel;
	let pathSegment = req.path.split("/");
	if (req.user.isSuperAdmin) return false;
	let appsAdmin = [];
	if (accessLevel == "Selected") {
		appsAdmin = req.user.accessControl.apps ? req.user.accessControl.apps.map(obj => obj._id) : [];
    }
    if (authUtil.compareUrl("/api/a/sec/identity/{appName}", req.path) || authUtil.compareUrl("/api/a/sec/identity/{appName}/{action}", req.path) || authUtil.compareUrl("/api/a/sec/identity/{appName}/certificate/{action}", req.path)) {
		let appAdminFlag = accessLevel == "Selected" && appsAdmin.indexOf(pathSegment[5]) > -1;
		return !appAdminFlag;
	}
	if (req.path.startsWith("/api/a/sec/keys")) {
		return !req.user.isSuperAdmin;
    }
    
    if(authUtil.compareUrl("/api/a/sec/enc/{appName}/decrypt", req.path) && req.method == "POST") {
		// checking if user has any role from that app.
		let app = req.path.split("/")[5];
		return !req.user.roles.some(role => role.app === app);

	}

	let secPMApi = ["/bm/{partnerId}/secret/enc", "/bm/{partnerId}/secret/dec/{secretId}", "/bm/{partnerId}/secret/{secretId}"];
	let secPMApiFlag = secPMApi.some(_a => authUtil.compareUrl(`/api/a/sec${_a}`, req.path));
	if (secPMApiFlag) {
        let permissionApp = [];
        let allowedPermission = [];
        let appAdminFlag = appsAdmin.indexOf(req.apiDetails.app) > -1;
        if (appAdminFlag) return false;
        if (req.method === "GET") {
            allowedPermission = ["PMPP", "PVPP"];
        } else if (req.method === "PUT" || req.method === "DELETE" || req.method === "POST") {
            allowedPermission = ["PMPP"];
        }
        permissionApp = req.user.roles.filter(_r => (allowedPermission.indexOf(_r.id) > -1) && _r.entity === "PM").map(_r => _r.app);
        let appFlag = appsAdmin.concat(permissionApp).indexOf(req.apiDetails.app) == -1;
        if (!appFlag) return false;
        if (req.method === "GET") {
            let exceptionPM = req.user.roles.filter(_r => (_r.id === "PMPP" || _r.id === "PVPP") && _r.entity.startsWith("PM_")).map(_r => _r.entity.substr(3));
            return exceptionPM.indexOf(pathSegment[5]) === -1;
        } else if (["PUT", "POST", "DELETE"].indexOf(req.method) > -1) {
            let exceptionPM = req.user.roles.filter(_r => (_r.id === "PMPP") && _r.entity.startsWith("PM_")).map(_r => _r.entity.substr(3));
            return exceptionPM.indexOf(pathSegment[5]) === -1;
        }
        return true;
    }
}

function secAuthorizationMw(req, res, next) {
	
	// Commenting this check as it will allow access to all 
	// users which is meant only for app and super admin
    // if (req.path.startsWith("/api/a/sec/identity")) {
	// 	return next();
    // }
    if(isSecAccessControlInvalid(req)) {
        return commonAuthZMw.sendForbidden(res);
    }
    if (req.path.startsWith("/api/a/sec/keys")) {
        if (req.user.isSuperAdmin) {
            return next();
        } else {
            return commonAuthZMw.sendForbidden(res);
        }
	}
	return next();
}

module.exports = secAuthorizationMw;