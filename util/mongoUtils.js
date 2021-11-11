"use strict";

const mongo = require("mongodb").MongoClient;
const config = require("../config/config");

let logger = global.logger;

let authorDB = process.env.MONGO_AUTHOR_DBNAME || "datastackConfig";
let logsDB = process.env.MONGO_LOGS_DB || "datastackLogs";

logger.debug(`AuthorDB :: ${authorDB}`);
logger.debug(`LogsDB :: ${logsDB}`);

let e = {};

/** 
 * Init mongo connections and report on status
 */
e.init = () => {
	mongo.connect(config.mongoUrlAuthor, config.mongoOptions, (error, db) => {
		if (error) logger.error(error.message);
		if (db) {
			global.mongoConnectionAuthor = db.db(authorDB);
			global.mongoAuthorConnected = true;
			logger.info("DB :: Author :: Connected");
			db.on("connecting", () => {
				global.mongoAuthorConnected = false;
				logger.info("DB :: Author :: Connecting");
			});
			db.on("close", () => {
				global.mongoAuthorConnected = false;
				logger.error("DB :: Author :: Lost Connection");
			});
			db.on("connected", () => {
				global.mongoAuthorConnected = true;
				logger.info("DB :: Author :: Connected");
			});
		}
	});

	mongo.connect(config.mongoUrlAppcenter, config.mongoOptions, (error, db) => {
		if (error) logger.error(error.message);
		if (db) {
			global.appcenterDbo = db;
			global.mongoAppCenterConnected = true;
			logger.info("DB :: Appcenter :: Connected");
			db.on("connecting", () => {
				global.mongoAppCenterConnected = false;
				logger.info("DB :: AppCenter :: Connecting");
			});
			db.on("close", () => {
				global.mongoAppCenterConnected = false;
				logger.error("DB :: AppCenter :: Lost Connection");
			});
			db.on("connected", () => {
				global.mongoAppCenterConnected = true;
				logger.info("DB :: AppCenter :: Connected");
			});
		}
	});

	mongo.connect(config.mongoUrlAuthor, config.mongoOptions, (error, db) => {
		if (error) logger.error(error.message);
		if (db) {
			global.mongoConnectionLogs = db.db(logsDB);
			global.mongoLogsConnected = true;
			logger.info("DB :: Logs :: Connected");
			createIndexforGWLogs();
			db.on("connecting", () => {
				global.mongoLogsConnected = false;
				logger.info("DB :: Logs :: Connecting");
			});
			db.on("close", () =>{
				global.mongoLogsConnected = false;
				logger.error("DB :: Logs :: Lost Connection");
			});
			db.on("connected", () => {
				global.mongoLogsConnected = true;
				logger.info("DB :: Logs :: Connected");
				createIndexforGWLogs();
			});
		}
	});
};

/**
 * Find in the DB
 * @param  {boolean} _isAppCenter
 * @param  {string} _collection
 * @param  {object} _filter
 * @param  {object} _select
 */
e.find = async(_isAppCenter, _collection, _filter, _select) => {
	if (_isAppCenter) logger.trace("MongoDB find() on appcenter DB");
	else logger.trace("MongoDB find() on author DB");
	logger.trace(`MongoDB find() : collection : ${_collection}`);
	logger.trace(`MongoDB find() : filter : ${JSON.stringify(_filter)}`);
	logger.trace(`MongoDB find() : select : ${_select}`);
	let db = global.mongoConnectionAuthor;
	if (_isAppCenter) db = global.appcenterDbo;
	try {
		return await db.collection(_collection).find(_filter ? _filter : {}).project(_select).toArray();
	} catch (e) {
		logger.error(e);
		throw "DB lookup error";
	}
};

async function createIndexforGWLogs(){
	try {
		await global.mongoConnectionLogs.collection("gw.logs").createIndex(
			{"expireAt" : 1}, { expireAfterSeconds: 0 }
		);
		logger.info("Successfully created index for GW Logs");
	} catch (error) {
		logger.error(error.message);
	}
}

/**
 * Find one in the DB
 * @param  {boolean} _isAppCenter
 * @param  {string} _collection
 * @param  {object} _id
 */
e.findOne = async (_isAppCenter, _collection, _query, _options) => {
	if (_isAppCenter) logger.trace("MongoDB findOne() on appcenter DB");
	else logger.trace("MongoDB findOne() on author DB");
	logger.trace(`MongoDB findOne() : collection : ${_collection}`);
	logger.trace(`MongoDB findOne() : query : ${JSON.stringify(_query)}`);
	logger.trace(`MongoDB findOne() : options : ${_options}`);
	let db = global.mongoConnectionAuthor;
	if (_isAppCenter) db = global.appcenterDbo;
	try {
		return await db.collection(_collection).findOne(_query, _options);
	} catch (e) {
		logger.error(e);
		throw "DB lookup error";
	}
};

e.aggregate = async (_isAppCenter, _collection, _aggregationPipeline) => {
	if (_isAppCenter) logger.trace("MongoDB aggregate() on appcenter DB");
	else logger.trace("MongoDB aggregate() on author DB");
	logger.trace(`MongoDB aggregate() : collection : ${_collection}`);
	logger.trace(`MongoDB aggregate() : aggregationPipeline : ${JSON.stringify(_aggregationPipeline)}`);
	let db = global.mongoConnectionAuthor;
	if (_isAppCenter) db = global.appcenterDbo;
	try {
		return await db.collection(_collection).aggregate(_aggregationPipeline).toArray();
	} catch (e) {
		logger.error(e);
		throw "DB lookup error";
	}
};

e.getUserApps = async (_id) => {
	logger.trace(`Getting apps for ${_id} using aggregateQuery()`);
	let aggregateQuery = [
		{ "$match": { "users": _id } },
		{ "$project": { "app": 1 } },
		{ "$group": { "_id": "$app" } },
		{ "$group": { "_id": null, "apps": { "$addToSet": "$_id" } } }
	];
	return await e.aggregate(false, "userMgmt.groups", aggregateQuery);
};

e.getAppCenterDataServicesList = async (_id) => {
	logger.trace(`Getting list of data service for ${_id} using aggregateQuery()`);
	let aggregationPipeline = [
		{
			"$match": { "users": _id }
		}, {
			"$project": { "roles": 1 }
		}, {
			"$unwind": { "path": "$roles",  "preserveNullAndEmptyArrays": false }
		}, {
			"$match": { "roles.entity": new RegExp("^SRVC"),  "roles.type": "appcenter" }
		}, {
			"$group": { "_id": null, "entities": { "$addToSet": "$roles.entity" } }
		}
	];
	return await e.aggregateQuery(false, "userMgmt.groups", aggregationPipeline);
};

e.getAppCenterDataServiceRolesList = async (_serviceIds) => {
	logger.trace(`Getting list of appcenter roles for dataservices - ${_serviceIds.join(",")} - using aggregateQuery()`);
	let aggregationPipeline = [
		{
			"$match": { "_id": { "$in": _serviceIds } }
		}, {
			"$project": { "roles": 1,  "app": 1,  "entity": 1 }
		}, {
			"$unwind": { "path": "$roles", "preserveNullAndEmptyArrays": false }
		}, {
			"$match": { "roles.operations.method": { "$in": [ "POST", "PUT", "DELETE", "REVIEW" ] } }
		}, {
			"$group": { "_id": null,  "roles": { "$addToSet": "$roles.id" } }
		}
	];
	return await e.aggregateQuery(false, "userMgmt.roles", aggregationPipeline);
};

e.getRolesForAppandEntity = async (_userId, _app, _entity) => {
	logger.trace(`Getting list of roles for user ${_userId}, for dataservice ${_entity} under app ${_app} using aggregateQuery()`);
	let aggregationPipeline = [
		{
			"$match": { "users": _userId, "app": _app }
		}, {
			"$project": { "roles": 1 }
		}, {
			"$unwind": { "path": "$roles",  "preserveNullAndEmptyArrays": false }
		}, {
			"$match": { "roles.entity": _entity }
		}
	];
	return await e.aggregateQuery(false, "userMgmt.groups", aggregationPipeline);
};

module.exports = e;