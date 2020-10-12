'use strict'

const request = require("request-promise")

const gwUtil = require("../util/gwUtil")
const urlConfig = require("../config/urlConfig")
const cacheUtil = require("../util/cacheUtil")
const db = require("../util/mongoUtils")

let e = {}

e.highestPermissionHandlerCurrentUser = async (_req, _res) => {
	logger.debug(`highestPermissionHandlerCurrentUser`)
	let perm = []
	// To fetch all the permission id the user has for a app and entity.
	if (_req.query.app && _req.query.entity) {
		perm = await db.getRolesForAppandEntity(_req.user._id, _req.query.app, _req.query.entity)
	}
	e.getPermissions(_req, _req.query.entity, _req.query.app)
		.then(_p => {
			let allPermission = _p[0]
			if (!allPermission) {
				_res.status(400).send({ message: "permission not found" })
			} else {
				allPermission.fields = JSON.parse(allPermission.fields)
				let isAdminUser = _req.user && _req.user.isSuperAdmin ? true : false
				let highestPermission = e.computeMethodAllowed(perm, allPermission, isAdminUser)
				// let highestPermission = e.getHighestPermission(allPermission.fields, perm);
				_res.send(highestPermission)
			}
		})
		.catch(err => {
			logger.error(err)
			_res.status(500).send({
				message: err.message
			})
		})
}

e.getPermissions = async (_req, _entity, _app) => {
	let promise = Promise.resolve()
	if (_req.path.startsWith("/api/c")) {
		let permission = await cacheUtil.getCachedRoleAppcenter(_entity, app, _req)
		if(permission) {
			logger.debug("Fetched role from cache")
			return permission
		}
	}

	let filterObj = {}
	if (_entity) {
		if (Array.isArray(_entity)) filterObj.entity = { "$in": _entity }
		else filterObj._entity = _entity
	}
	if (app) filterObj.app = app
	else filterObj.app = {"$in": await db.getUserApps(_req.user._id)}

	logger.debug(`Permission filter :: ${filterObj}`)

	let roles = await db.find(false, "userMgmt.roles", filterObj, null)
	if (_req.path.startsWith("/api/c")) {
		cacheUtil.cacheRoleAppcenter(_entity, roles)
		logger.debug(`Role cached for entity :: ${_entity}`)
	}
	return roles
}

module.exports = e