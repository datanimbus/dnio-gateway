const _ = require("lodash");
let authUtil = require("./../../util/authUtil");
let commonAuthZMw = require("./common.authorizationMiddleware");
let logger = global.logger;


function isWorkflowApiAccessInvalid(req, serviceId) {
	if (req.user.isSuperAdmin) return false;
	let pathSegment = req.path.split("/");
	req.user.roles = req.user.roles.filter(r => r.entity);

	if (authUtil.compareUrl("/api/c/{app}/{api}/utils/workflow", req.path) || authUtil.compareUrl("/api/c/{app}/{api}/utils/workflow/count", req.path)) {
		if (req.method === "GET") {
			let serviceList = req.user.roles.filter(_r => _r.type == "appcenter" && !(_r.entity.startsWith("INTR") || _r.entity.startsWith("BM_"))).map(_r => _r.entity);
            logger.info('serviceID :: ', serviceId)
            logger.info('serviceIDssss :: ', serviceList)
			return !serviceList.includes(serviceId);
		}
		if (req.method === "POST") {
			return true;
		}
	}
	if (authUtil.compareUrl("/api/c/{app}/{api}/utils/workflow/action", req.path)) {
		let serviceList = req.apiDetails.manageServiceList;
        return !serviceList.includes(serviceId);
	}
	if (authUtil.compareUrl("/api/c/{app}/{api}/utils/workflow/{id}", req.path) || authUtil.compareUrl("/api/c/{app}/{api}/utils/workflow/doc/{id}", req.path)) {
		let serviceList = [];
		if (req.method === "GET")
			serviceList = req.user.roles.filter(_r => _r.type == "appcenter" && _r.entity.startsWith("SRVC")).map(_r => _r.entity);
		else {
			serviceList = req.apiDetails.manageServiceList;
		}
		return !serviceList.includes(serviceId);
	}
	if (authUtil.compareUrl("/api/c/{app}/{api}/utils/workflow/group/{app}", req.path)) {
		let appList = req.user.roles.filter(_r => _r.type == "appcenter" && _r.entity.startsWith("SRVC")).map(_r => _r.app);
		return appList.indexOf(pathSegment[8]) === -1;
	}
}

function dsAuthorizationMw(req, res, next) {
    let txnId = req.headers.TxnId
    const allowedApiEndPoint = ["file", "hook"];
    let reqPath = req.path.split("/");
    if (req.path.startsWith("/api/c") && allowedApiEndPoint.includes(reqPath[5])) {
        return next();
    }
    commonAuthZMw.getAdditionalData(req, res, next)
        .then(data => {
            let { reqApp, reqEntity, permissions } = data;
            logger.debug(`[${txnId}] DS AuthMW :: Additional data :: App :: ${reqApp}`);
            logger.debug(`[${txnId}] DS AuthMW :: Additional data :: Entity :: ${reqEntity}`);
            if (permissions) {
                let userPermissionIds = [];
                // To fetch all the permission id the user has for a app and entity.
                if (req.user.roles && Array.isArray(req.user.roles)) {
                    userPermissionIds = req.user.roles.filter(_r => (reqApp ? _r.app === reqApp : true) && (Array.isArray(reqEntity) ? reqEntity.indexOf(_r.entity) > -1 : _r.entity === reqEntity)).map(_o => _o.id);
                    logger.debug(`[${txnId}] DS AuthMW :: Permission Ids :: ${userPermissionIds.join(", ")}`);
                }
                let allPermission = permissions[0];
                logger.trace(`[${txnId}] DS AuthMW :: All permission :: ${JSON.stringify({ allPermission })}`);
                if (!allPermission) {
                    logger.error(`[${txnId}] DS AuthMW :: All permission :: Not allowed`);
                    return commonAuthZMw.sendForbidden(res);
                }
                allPermission.fields = (typeof (allPermission.fields) == "object") ? allPermission.fields : JSON.parse(allPermission.fields);
                let urlArr = req.path.split("/");
                let isAdminUser = req.user && req.user.isSuperAdmin ? true : false;
                let highestPermissionObject = authUtil.computeMethodAllowed(userPermissionIds, allPermission, isAdminUser);
                let getObj = _.remove(highestPermissionObject, _d => _d.method === "GET");
                req._highestPermission = highestPermissionObject.concat(getObj);
                if (urlArr[5] && urlArr[5] === "fileMapper") {
                    req.entityPermission = permissions[0];
                    req.userPermissionIds = userPermissionIds;
                    return next();
                }
                let permissionAllowed = highestPermissionObject.map(_h => _h.method);
                logger.trace(`[${txnId}] DS AuthMW :: Permission allowed :: ${JSON.stringify(permissionAllowed)}`);
                if (authUtil.compareUrl("/api/c/{app}/{api}/utils/aggregate", req.path)) {
                    if (req.body) {
                        if (permissionAllowed.length === 0) {
                            logger.trace(`[${txnId}] DS AuthMW :: Fields ${JSON.stringify(getObj[0].fields)}`);
                            let fields = authUtil.flattenPermission(getObj[0].fields, "", ["W", "R"]);
                            let projection = fields.reduce((acc, curr) => {
                                acc[curr] = 1;
                                return acc;
                            }, {});
                            let query = { "$project": projection };
                            if (Array.isArray(req.body)) {
                                req.body.unshift(query);
                            } else {
                                req.body = [query, req.body];
                            }
                            logger.trace(`[${txnId}] DS AuthMW :: Updated body :: ${JSON.stringify(req.body)}`);
                        }
                        if (!req.user.isSuperAdmin)
                            return authUtil.checkRecordPermissionForUserCRUD(userPermissionIds, allPermission, req.method, "API", req.body, req).then(() => next());
                        else
                            return next();
                    }

                }
                if (urlArr[5] == 'utils' && urlArr[6] == 'workflow') {
                    logger.info('checking for wf api :: ')
                    if (isWorkflowApiAccessInvalid(req, reqEntity)) {
                        res.status(403).json({ message: "Access denied" });
                        return next(new Error("Access denied"));
                    }
                    return authUtil.checkRecordPermissionForUserWF(req, reqEntity)
                        .then((isAllowed) => {
                            logger.trace(`[${txnId}] checkRecordPermissionForUserWF :: isAllowed :: ${isAllowed}`);
                            if(isAllowed)
                                return next();
                            else
                                return commonAuthZMw.sendForbidden(res);
                        })
                        .catch(err => {
                            logger.error('Error in wfAuthorizationMw :: ', err);
                            next(err);
                        });
                }
                if (permissionAllowed.indexOf(req.method) > -1) {
                    if (!req.user.isSuperAdmin)
                        return authUtil.checkRecordPermissionForUserCRUD(userPermissionIds, allPermission, req.method, "API", req.body, req).then(() => next());
                    else next();
                } else {
                    let paths = req.path.split("/");
                    if (req.method == "GET" || (req.method == "POST" && (paths[6] == "simulate" || paths[6] == "experienceHook"))) {
                        if (permissionAllowed.length > 0) {
                            if (!req.user.isSuperAdmin)
                                return authUtil.checkRecordPermissionForUserCRUD(userPermissionIds, allPermission, req.method, "API", req.body, req).then(() => next());
                            else next();
                        } else {
                            highestPermission = getObj[0].fields;
                            logger.debug(JSON.stringify({ highestPermission }));
                            if (!highestPermission || _.isEmpty(highestPermission)) {
                                return commonAuthZMw.sendForbidden(res);
                            }
                            if (!authUtil.hasAnyReadPermission(highestPermission)) {
                                return commonAuthZMw.sendForbidden(res);
                            }
                            if (!req.user.isSuperAdmin)
                                return authUtil.checkRecordPermissionForUserCRUD(userPermissionIds, allPermission, req.method, "API", req.body, req).then(() => next());
                            else next();
                        }
                    } else {
                        return commonAuthZMw.sendForbidden(res);
                    }
                }
            }
        }).catch(err => {
            logger.error('Error in dsAuthorizationMw :: ', err);
            next(err);
        });
}

module.exports = dsAuthorizationMw;