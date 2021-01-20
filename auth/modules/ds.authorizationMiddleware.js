const _ = require("lodash");
let authUtil = require("./../../util/authUtil");
let commonAuthZMw = require("./common.authorizationMiddleware");


function dsAuthorizationMw(req, res, next) {
    const allowedApiEndPoint = ["file", "hook"];
    if (req.path.startsWith("/api/c") && allowedApiEndPoint.indexOf(req.path.split("/")[5]) > -1) {
        return next();;
    }
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
                logger.debug('allPermission :: ', JSON.stringify({ allPermission }));
                if (!allPermission) {
                    return commonAuthZMw.sendForbidden(_res);
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
                logger.debug(JSON.stringify({ permissionAllowed }));
                if (authUtil.compareUrl("/api/c/{app}/{api}/utils/aggregate", req.path)) {
                    if (req.body) {
                        if (permissionAllowed.length === 0) {
                            logger.debug("fields " + JSON.stringify(getObj[0].fields));
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
                            logger.debug("Updated body " + JSON.stringify(req.body));
                        }
                        if (!req.user.isSuperAdmin)
                            return authUtil.checkRecordPermissionForUserCRUD(userPermissionIds, allPermission, req.method, "API", req.body, req).then(() => next());
                        else
                            return next();
                    }

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
                                return commonAuthZMw.sendForbidden(_res);
                            }
                            if (!authUtil.hasAnyReadPermission(highestPermission)) {
                                return commonAuthZMw.sendForbidden(_res);
                            }
                            if (!req.user.isSuperAdmin)
                                return authUtil.checkRecordPermissionForUserCRUD(userPermissionIds, allPermission, req.method, "API", req.body, req).then(() => next());
                            else next();
                        }
                    } else {
                        return commonAuthZMw.sendForbidden(_res);
                    }
                }
            }
        }).catch(err => {
            logger.error('Error in dsAuthorizationMw :: ', err);
            next(err);
        });
}

module.exports = dsAuthorizationMw;