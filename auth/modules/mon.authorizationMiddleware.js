let authUtil = require("./../../util/authUtil");
let commonAuthZMw = require("./common.authorizationMiddleware");
let _ = require('lodash');

let logger = global.logger;

function isMonAccessControlValid(req) {
    let accessLevel = req.user.accessControl.accessLevel;
    let appsAdmin = [];
    if (accessLevel == "Selected") {
        appsAdmin = req.user.accessControl.apps ? req.user.accessControl.apps.map(obj => obj._id) : [];
    }
    if (req.user.isSuperAdmin) return true;
    
    if (authUtil.compareUrl("/api/a/mon/{app}/appCenter/{SRVC}/logs", req.path) || authUtil.compareUrl("/api/a/mon/{app}/appCenter/{SRVC}/logs/count", req.path)) {
        let permissionApp = req.user.roles.filter(_r => (_r.id === "PVDSAAP") && _r.entity == "SM").map(_r => _r.app);
        return appsAdmin.concat(permissionApp).indexOf(req.apiDetails.app) >= 0;

    } else if (authUtil.compareUrl("/api/a/mon/{app}/appCenter/{SRVC}/postHook", req.path) || authUtil.compareUrl("/api/a/mon/{app}/appCenter/{SRVC}/postHook/count", req.path)) {
        // TODO -> Test for roles
        logger.info('user roles;::: ', JSON.stringify(req.user.roles));
        let permissionApp = req.user.roles.filter(_r => (_r.id === "PVDSAPO") && _r.entity == "SM").map(_r => _r.app);
        return appsAdmin.concat(permissionApp).indexOf(req.apiDetails.app) >= 0;

    } else if (authUtil.compareUrl("/api/a/mon/appCenter/{SRVC}/preHook", req.path) || authUtil.compareUrl("/api/a/mon/appCenter/{SRVC}/preHook/count", req.path)) {
        let permissionApp = req.user.roles.filter(_r => (_r.id === "PVDSAPR") && _r.entity == "SM").map(_r => _r.app);
        return appsAdmin.concat(permissionApp).indexOf(req.apiDetails.app) >= 0;

    } else if (authUtil.compareUrl("/api/a/mon/{app}/author/sm/audit", req.path) || authUtil.compareUrl("/api/a/mon/{app}/author/sm/audit/count", req.path)) {
        let permissionApp = req.user.roles.filter(_r => (_r.id === "PVDSASR" || _r.id === "PVDSA") && _r.entity == "SM").map(_r => _r.app);
        return appsAdmin.concat(permissionApp).indexOf(req.apiDetails.app) >= 0;

    } else if (authUtil.compareUrl("/api/a/mon/{app}dataService/log", req.path) || authUtil.compareUrl("/api/a/mon/{app}/dataService/log/count", req.path)) {
        if (req.user.isSuperAdmin) return true;
        let permissionApp = req.user.roles.filter(_r => (_r.id === "PVISDS") && _r.entity == "INS").map(_r => _r.app);
        permissionApp = _.uniq(appsAdmin.concat(permissionApp));
        if(!permissionApp.length) return false;
        modifyMonLogFilter(req, permissionApp, true);
        return true;
    } else if (authUtil.compareUrl("/api/a/mon/{app}/author/user/log", req.path) || authUtil.compareUrl("/api/a/mon/{app}/author/user/log/count", req.path)) {
        if (req.user.isSuperAdmin) return true;
        let permissionApp = req.user.roles.filter(_r => (_r.id === "PVISU") && _r.entity == "INS").map(_r => _r.app);
        permissionApp = _.uniq(appsAdmin.concat(permissionApp));
        if(!permissionApp.length) return false;
        modifyMonLogFilter(req, permissionApp, false);
        return true;

    } else if (authUtil.compareUrl("/api/a/mon/{app}/author/group/log", req.path) || authUtil.compareUrl("/api/a/mon/{app}/author/group/log/count", req.path)) {
        if (req.user.isSuperAdmin) return true;
        let permissionApp = req.user.roles.filter(_r => (_r.id === "PVISG") && _r.entity == "INS").map(_r => _r.app);
        permissionApp = _.uniq(appsAdmin.concat(permissionApp));
        if(!permissionApp.length) return false;
        modifyMonLogFilter(req, permissionApp, false);
        return true;
    } else {
        return true;
    }
}

function modifyMonLogFilter(req, permissionApp, isDSLogApi) {
	let customFilter = { $and: [{}] };
	if(isDSLogApi)
		customFilter["$and"][0]["app"] = { $in: permissionApp };
	else
		customFilter["$and"][0]["apps"] = { $in: permissionApp };
	if(req.query.filter) {
		if(typeof req.query.filter == "string")
			req.query.filter = JSON.parse(req.query.filter);
		customFilter["$and"].push(req.query.filter);
	}
	req.query.filter = JSON.stringify(customFilter);
}

function monAuthorizationMw(req, res, next) {
    if (req.path.startsWith("/api/a/mon/ui/logs") && req.body) {
        req.body.userId = req.user._id;
    }
    if (isMonAccessControlValid(req)) {
        logger.info('Access control valid');
        return next();
    }
    if (res.headersSent) return
    commonAuthZMw.getAdditionalData(req, res, next)
        .then(data => {
            let { reqApp, reqEntity, permissions } = data;
            if (permissions) {
                let userPermissionIds = [];
                // To fetch all the permission id the user has for a app and entity.
                if (req.user.roles && Array.isArray(req.user.roles)) {
                    userPermissionIds = req.user.roles.filter(_r => (reqApp ? _r.app === reqApp : true) && (Array.isArray(reqEntity) ? reqEntity.indexOf(_r.entity) > -1 : _r.entity === reqEntity)).map(_o => _o.id);
                    logger.debug(`Permission Ids :: ${userPermissionIds.join(", ")}`);
                }

                let allPermission = permissions[0];
                logger.debug(JSON.stringify({ allPermission }));
                if (!allPermission) {
                    commonAuthZMw.sendForbidden(res);
                    return;
                }
                allPermission.fields = (typeof (allPermission.fields) == "object") ? allPermission.fields : JSON.parse(allPermission.fields);
                let isAdminUser = req.user && req.user.isSuperAdmin ? true : false;
                let highestPermissionObject = authUtil.computeMethodAllowed(userPermissionIds, allPermission, isAdminUser);
                let getObj = _.remove(highestPermissionObject, _d => _d.method === "GET");
                req._highestPermission = highestPermissionObject.concat(getObj);
                let permissionAllowed = highestPermissionObject.map(_h => _h.method);
                logger.debug(JSON.stringify({ permissionAllowed }));
                if (permissionAllowed.indexOf(req.method) > -1) {
                    if (!req.user.isSuperAdmin)
                        return authUtil.checkRecordPermissionForUserCRUD(userPermissionIds, allPermission, req.method, "API", req.body, req).then(() => next());
                    else next();
                } else {
                    if (req.method == "GET") {
                        if (permissionAllowed.length > 0) {
                            if (!req.user.isSuperAdmin)
                                return authUtil.checkRecordPermissionForUserCRUD(userPermissionIds, allPermission, req.method, "API", req.body, req).then(() => next());
                            else next();
                        } else {
                            highestPermission = getObj[0].fields;
                            logger.debug(JSON.stringify({ highestPermission }));
                            if (!highestPermission || _.isEmpty(highestPermission)) {
                                commonAuthZMw.sendForbidden(res);
                                return;
                            }
                            if (!authUtil.hasAnyReadPermission(highestPermission)) {
                                commonAuthZMw.sendForbidden(res);
                                return;
                                // next(new Error("Not Permitted"));
                            }
                            if (!req.user.isSuperAdmin)
                                return authUtil.checkRecordPermissionForUserCRUD(userPermissionIds, allPermission, req.method, "API", req.body, req).then(() => next());
                            else next();
                        }
                    } else {
                        commonAuthZMw.sendForbidden(res);
                    }
                }
            }
        }).catch(err => {
            logger.error('Error in monAuthorizationMw :: ', err);
            next(err);
        });
}

module.exports = monAuthorizationMw;