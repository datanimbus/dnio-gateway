let authUtil = require("./../../util/authUtil");
let commonAuthZMw = require("./common.authorizationMiddleware");
let gwUtil = require("./../../util/gwUtil");

let logger = global.logger;

function isSMAccessControlInvalid(req) {
    if (req.user.isSuperAdmin) return false
    let accessLevel = req.user.accessControl.accessLevel;
    let pathSegment = req.path.split("/");
    let appsAllowed = []
    if (accessLevel == "Selected" && req.user.accessControl.apps) {
        appsAllowed = req.user.accessControl.apps.map(obj => obj._id);
    }
    if (authUtil.compareUrl("/api/a/sm/{app}/service/stop", req.path) || authUtil.compareUrl("/api/a/sm/{app}/service/start", req.path)) {
        let appAdminFlag = accessLevel == "Selected" && appsAllowed.indexOf(pathSegment[4]) > -1
        return !appAdminFlag
    }
    // Unknown SM api
    if (authUtil.compareUrl("/api/a/sm/usr/{app}/service/start", req.path) || authUtil.compareUrl("/api/a/sm/usr/{app}/service/stop", req.path)) {
        let appAdminFlag = accessLevel == "Selected" && (appsAllowed.indexOf(pathSegment[5]) > -1)
        logger.info('/sm/usr api triggered : ', req.path);
        return !appAdminFlag
    }
}

function createServiceObject(reqBody, data) {
    let retObj = JSON.parse(JSON.stringify(reqBody))
    Object.keys(data).forEach(key => {
        if (reqBody[key] || reqBody[key] === false || reqBody[key] === 0) {
            retObj[key] = reqBody[key]
        } else {
            retObj[key] = data[key]
        }
    })
    return retObj
}

function smAuthorizationMw(req, res, next) {
    logger.debug("Checking user auth in sm authz mw");
    if ((gwUtil.compareUrl("/api/a/sm/service/{srvcId}", req.path) || gwUtil.compareUrl("/api/a/sm/service", req.path) || gwUtil.compareUrl("/api/a/sm/globalSchema/{id}", req.path) || gwUtil.compareUrl("/api/a/sm/globalSchema", req.path))) {
        if (req.query.select) {
            logger.debug(`e.getAuthzMiddleware :: req.query.select : ${JSON.stringify(req.query.select)}`)
            req.query.select = authUtil.addSelect(["app"], req.query.select)
        }
    }
    if (req.path.startsWith("/api/a/sm") && req.method == "GET") {
		return next()
	}
    try {
        if (isSMAccessControlInvalid(req)) {
            return commonAuthZMw.sendForbidden(res)
        }
    } catch (err) {
        next(err)
    }
    if (res.headersSent) return
    commonAuthZMw.getAdditionalData(req, res, next)
        .then(data => {
            let {reqApp, reqEntity, permissions} = data;
            if (permissions) {
                if ((Array.isArray(reqEntity) && reqEntity.indexOf("SM") > -1) || reqEntity === "SM") {
                    let flag = commonAuthZMw.checkPermissions(permissions, req.user.roles, reqEntity, "SM", reqApp, req)
                    logger.debug({ flag })
                    if (flag) {
                        if (authUtil.compareUrl("/api/a/sm/service/{Id}", req.path) && req.method === "PUT") {
                            req.body = createServiceObject(req.body, req.apiDetails)
                        }
                        next(); return
                    } else {
                        return commonAuthZMw.sendForbidden(res)
                    }
                }
                if ((Array.isArray(reqEntity) && reqEntity.indexOf("GS") > -1) || reqEntity === "GS") {
                    let flag = commonAuthZMw.checkPermissions(permissions, req.user.roles, reqEntity, "GS", reqApp, req)
                    logger.debug({ flag })
                    if (flag) {
                        next(); return
                    } else {
                        return commonAuthZMw.sendForbidden(res)
                    }
                }
            } else {
                // TBD what happens to else case
                logger.info("No permissions for access");
                return commonAuthZMw.sendForbidden(res);
            }
        }).catch(err => {
            logger.error('Error in smAuthorizationMw::: ', err)
            next(err)
        })
}

module.exports = smAuthorizationMw;