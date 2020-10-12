var authLogic = require('../../util/auth');
let authUtil = require("../../util/authUtil");

let logger = global.logger;

/**
 * This funnction returns request app, request entity and app permission.
 * req, res, next
 */
function getAdditionalData(req, res, next) {
    let authObject = authLogic.find(obj => {
        return req.path.startsWith(obj.url)
    });
    if (!authObject) {
        res.status(401).json({
            message: "Url not configured in authorization"
        })
        return Promise.reject(new Error('Url not configured in authorization'))
    } else {
        let apps = req.user.apps.map(obj => obj._id)
        logger.debug(`Apps: ${apps.join(", ")}`)
        // let perm = [];
        let reqApp = null
        let reqEntity = null
        logger.debug(authObject)
        return authObject.getApp(req)
            .then(_d => {
                logger.debug('app after auth object ', _d);
                if (_d instanceof Error) throw _d
                reqApp = _d
                if (reqApp && apps.indexOf(reqApp) == -1) {
                    res.status(403).json({
                        message: reqApp + " app is restricted"
                    })
                    throw new Error(reqApp + " app is restricted")
                }
            }, _d => {
                res.status(404).json({ message: _d.message })
                next(new Error(_d))
                return
            })
            .then(() => authObject.getEntity(req))
            .then(entity => {
                reqEntity = entity
                logger.debug('reqEntity :: ', reqEntity);
                if (!entity) {
                    sendForbidden(res)
                    return
                }
                // TO BE OPTIMIZED
                return authUtil.getPermissions(req, entity, reqApp)
            })
            .then((permissions) => {
                // logger.debug('Permissions of app : ', permissions);
                return Promise.resolve({ reqApp, reqEntity, permissions })
            })
            .catch(err => {
                logger.error('Error in getting additional data :: ', err)
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
    getAdditionalData: getAdditionalData,
    sendForbidden: sendForbidden
}