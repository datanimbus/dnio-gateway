var authLogic = require('../../util/auth');
let authUtil = require("../../util/authUtil");

let logger = global.logger;

function checkPermissions(relatedPermissions, userPermission, reqEntity, sMType, reqApp, req) {

    let isAdminUser = req.user && req.user.isSuperAdmin ? true : false
    if (isAdminUser) return true
    // req.apiDetails = { app: reqApp };

    let accessLevel = req.user.accessControl ? req.user.accessControl.accessLevel : null
    let appsAllowed = null

    if (accessLevel == "Selected") {
        appsAllowed = req.user.accessControl.apps ? req.user.accessControl.apps.map(obj => obj._id) : []
    }
    if (accessLevel === "Selected" && appsAllowed.indexOf(reqApp) > -1) {
        return true
    }

    let result = false
    if (req.path.endsWith("start") || req.path.endsWith("stop")) {
        let allowedPermission = ["PMDSPS"]
        let service = req.path.split("/")[4]
        let expFlag = []
        expFlag = req.user.roles.filter(_r => _r.entity === ("SM_" + service))
        let normalPermission = req.user.roles.filter(_r => !_r.entity.startsWith("SM_"))
        if (expFlag.length > 0) {
            expFlag.forEach(perm => {
                normalPermission.push(perm)
            })
        }
        allowedPermission.forEach(perm => {
            normalPermission.forEach(perms => {
                if (perms.id == perm) {
                    result = true
                }
            })
        })
        if (!result) {
            return result
        }
    }

    if (req.path.endsWith("deploy") || req.path.endsWith("repair")) {
        let allowedPermission = ["PMDSPD"]
        let service = req.path.split("/")[4]
        let expFlag = []
        expFlag = req.user.roles.filter(_r => _r.entity === ("SM_" + service))
        let normalPermission = req.user.roles.filter(_r => !_r.entity.startsWith("SM_"))
        if (expFlag.length > 0) {
            expFlag.forEach(perm => {
                normalPermission.push(perm)
            })
        }
        allowedPermission.forEach(perm => {
            normalPermission.forEach(perms => {
                if (perms.id == perm) {
                    result = true
                }
            })
        })
        if (!result) {
            return result
        }
    }

    if (req.path.endsWith("/purge/all") || req.path.endsWith("/purge/audit") || req.path.endsWith("/purge/log") || req.path.endsWith("/purge/author-audit")) {
        let allowedPermission = ["PMDSSRE"]
        let service = req.path.split("/")[4]
        let expFlag = []
        expFlag = req.user.roles.filter(_r => _r.entity === ("SM_" + service))
        let normalPermission = req.user.roles.filter(_r => !_r.entity.startsWith("SM_"))
        if (expFlag.length > 0) {
            expFlag.forEach(perm => {
                normalPermission.push(perm)
            })
        }
        allowedPermission.forEach(perm => {
            normalPermission.forEach(perms => {
                if (perms.id == perm) {
                    result = true
                }
            })
        })
        if (!result) {
            return result
        }
    }

    if (req.path.endsWith("draftDelete")) {
        let allowedPermission = ["PMDSBD"]
        let service = req.path.split("/")[4]
        let expFlag = []
        expFlag = req.user.roles.filter(_r => _r.entity === ("SM_" + service))
        let normalPermission = req.user.roles.filter(_r => !_r.entity.startsWith("SM_"))
        if (expFlag.length > 0) {
            expFlag.forEach(perm => {
                normalPermission.push(perm)
            })
        }
        allowedPermission.forEach(perm => {
            normalPermission.forEach(perms => {
                if (perms.id == perm) {
                    result = true
                }
            })
        })
        if (!result) {
            return result
        }
    }

    logger.debug(JSON.stringify({ relatedPermissions, userPermission, reqEntity, sMType, reqApp }))
    let expEntityId = Array.isArray(reqEntity) && reqEntity.find(_rE => _rE.startsWith(sMType + "_"))
    let expFlag = expEntityId && Array.isArray(reqEntity) && userPermission.find(_usrP => _usrP.entity === expEntityId)
    let allPermission = null
    let allowedUserPermission = null
    allPermission = expFlag ? relatedPermissions.find(_rlP => _rlP.entity === expEntityId) : relatedPermissions.find(_rlP => _rlP.entity !== expEntityId)
    allowedUserPermission = req.user.roles.filter(_r => (_r.app === allPermission.app) && (_r.entity === allPermission.entity)).map(_o => _o.id)
    allPermission.fields = JSON.parse(allPermission.fields)
    logger.debug(JSON.stringify({ allowedUserPermission, allPermission }))
    let highestPermissionObject = authUtil.computeMethodAllowed(allowedUserPermission, allPermission, isAdminUser)
    logger.debug(JSON.stringify({ highestPermissionObject }))
    let highestPermission = highestPermissionObject.find(_hpo => _hpo.method === req.method)
    logger.debug(JSON.stringify({ highestPermission }))
    if (!highestPermission) return false

    return highestPermission ? authUtil.checkPermission(highestPermission.fields, ["W"], req.body) : false
}

/**
 * This funnction returns request app, request entity and app permission.
 * req, res, next
 */
function getAdditionalData(req, res, next) {
		let txnId = req.headers.TxnId
    let authObject = authLogic.find(obj => {
      return req.path.startsWith(obj.url)
    });
    logger.debug(`[${txnId}] Addnl data :: Auth object :: ${JSON.stringify(authObject)}`)
    if (!authObject) {
      res.status(401).json({ message: "Url not configured in authorization" })
  		logger.error(`[${txnId}] Addnl data :: Url not configured in authorization`)
      return Promise.reject(new Error('Url not configured in authorization'))
    } else {
      let apps = req.user.apps.map(obj => obj._id)
    	logger.debug(`[${txnId}] Addnl data :: Apps :: ${JSON.stringify(apps)}`)
      let reqApp = null
      let reqEntity = null
      return authObject.getApp(req)
        .then(_d => {
          logger.debug(`[${txnId}] Addnl data :: App after auth object : ${_d}`);
          if (_d instanceof Error) throw _d
          reqApp = _d
          if (!req.user.isSuperAdmin && reqApp && apps.indexOf(reqApp) == -1) {
          	logger.error(`[${txnId}] Addnl data :: ${reqApp} app is restricted`);
            res.status(403).json({ message: `${reqApp} app is restricted`})
            throw new Error(`${reqApp} app is restricted`)
          }
        }, _err => {
          logger.error(`[${txnId}] Addnl data :: ${_err.message}`);
          res.status(404).json({ message: _err.message })
          next(new Error(_err))
          return
        })
        .then(() => authObject.getEntity(req))
        .then(entity => {
          reqEntity = entity
          logger.debug(`[${txnId}] Addnl data :: Entity :: ${entity}`);
          if (!entity) {
          	logger.error(`[${txnId}] Addnl data :: Entity not found`);
            return sendForbidden(res)
          }
          // TO BE OPTIMIZED
          return authUtil.getPermissions(req, entity, reqApp)
        })
        .then((permissions) => {
          logger.trace(`[${txnId}] Addnl data :: Permissions :: ${JSON.stringify(permissions)}`);
          // logger.debug('Permissions of app : ', permissions);
          return Promise.resolve({ reqApp, reqEntity, permissions })
        })
        .catch(err => {
          logger.error(`[${txnId}] Error in getting additional data :: ${err.message}`)
          next(err)
        })
    }
}



function sendForbidden(res) {
	res.status(403).json({
		message: "Forbidden"
	})
}

module.exports = {
    checkPermissions: checkPermissions,
    getAdditionalData: getAdditionalData,
    sendForbidden: sendForbidden
}