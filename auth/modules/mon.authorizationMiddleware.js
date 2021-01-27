let authUtil = require("./../../util/authUtil");
let commonAuthZMw = require("./common.authorizationMiddleware");

let logger = global.logger;

function isMonAccessControlValid(req) {
    let accessLevel = req.user.accessControl.accessLevel;
    let appsAdmin = [];
    if (accessLevel == "Selected") {
        appsAdmin = req.user.accessControl.apps ? req.user.accessControl.apps.map(obj => obj._id) : [];
    }
    if (req.user.isSuperAdmin) return true;
    
    if (authUtil.compareUrl("/api/a/mon/appCenter/{SRVC}/logs", req.path) || authUtil.compareUrl("/api/a/mon/appCenter/{SRVC}/logs/count", req.path)) {
        let permissionApp = req.user.roles.filter(_r => (_r.id === "PVDSAAP") && _r.entity == "SM").map(_r => _r.app);
        return appsAdmin.concat(permissionApp).indexOf(req.apiDetails.app) >= 0;

    } else if (authUtil.compareUrl("/api/a/mon/appCenter/{SRVC}/postHook", req.path) || authUtil.compareUrl("/api/a/mon/appCenter/{SRVC}/postHook/count", req.path)) {
        // TODO -> Test for roles
        logger.info('user roles;::: ', JSON.stringify(req.user.roles));
        let permissionApp = req.user.roles.filter(_r => (_r.id === "PVDSAPO") && _r.entity == "SM").map(_r => _r.app);
        return appsAdmin.concat(permissionApp).indexOf(req.apiDetails.app) >= 0;

    } else if (authUtil.compareUrl("/api/a/mon/appCenter/{SRVC}/preHook", req.path) || authUtil.compareUrl("/api/a/mon/appCenter/{SRVC}/preHook/count", req.path)) {
        let permissionApp = req.user.roles.filter(_r => (_r.id === "PVDSAPR") && _r.entity == "SM").map(_r => _r.app);
        return appsAdmin.concat(permissionApp).indexOf(req.apiDetails.app) >= 0;

    } else if (authUtil.compareUrl("/api/a/mon/author/sm/audit", req.path) || authUtil.compareUrl("/api/a/mon/author/sm/audit/count", req.path)) {
        let permissionApp = req.user.roles.filter(_r => (_r.id === "PVDSASR") && _r.entity == "SM").map(_r => _r.app);
        return appsAdmin.concat(permissionApp).indexOf(req.apiDetails.app) >= 0;

    } else if (authUtil.compareUrl("/api/a/mon/dataService/log", _req.path) || authUtil.compareUrl("/api/a/mon/dataService/log/count", _req.path)) {
        if (_req.user.isSuperAdmin) return true;
        let permissionApp = _req.user.roles.filter(_r => (_r.id === "PVISDS") && _r.entity == "INS").map(_r => _r.app);
        permissionApp = _.uniq(appsAdmin.concat(permissionApp));
        if(!permissionApp.length) return false;
        modifyMonLogFilter(_req, permissionApp, true);
        return true;
    } else if (authUtil.compareUrl("/api/a/mon/author/user/log", _req.path) || authUtil.compareUrl("/api/a/mon/author/user/log/count", _req.path)) {
        if (_req.user.isSuperAdmin) return true;
        let permissionApp = _req.user.roles.filter(_r => (_r.id === "PVISU") && _r.entity == "INS").map(_r => _r.app);
        permissionApp = _.uniq(appsAdmin.concat(permissionApp));
        if(!permissionApp.length) return false;
        modifyMonLogFilter(_req, permissionApp, false);
        return true;

    } else if (authUtil.compareUrl("/api/a/mon/author/group/log", _req.path) || authUtil.compareUrl("/api/a/mon/author/group/log/count", _req.path)) {
        if (_req.user.isSuperAdmin) return true;
        let permissionApp = _req.user.roles.filter(_r => (_r.id === "PVISG") && _r.entity == "INS").map(_r => _r.app);
        permissionApp = _.uniq(appsAdmin.concat(permissionApp));
        if(!permissionApp.length) return false;
        modifyMonLogFilter(_req, permissionApp, false);
        return true;
    } else {
        return true;
    }
}

function modifyMonLogFilter(_req, permissionApp, isDSLogApi) {
	let customFilter = { $and: [{}] };
	if(isDSLogApi)
		customFilter["$and"][0]["app"] = { $in: permissionApp };
	else
		customFilter["$and"][0]["apps"] = { $in: permissionApp };
	if(_req.query.filter) {
		if(typeof _req.query.filter == "string")
			_req.query.filter = JSON.parse(_req.query.filter);
		customFilter["$and"].push(_req.query.filter);
	}
	_req.query.filter = JSON.stringify(customFilter);
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