"use strict";

const mongoose = require("mongoose");

const config = require("../config/config");
const { fetchEnvironmentVariablesFromDB } = require("../config/config");

let logger = global.logger;


let e = {};

/** 
 * Init mongo connections and report on status
 */
e.init = async () => {
	try {
		await connectToAuthorDatabase();
		await connectToAppcenterDatabase();

		// Now that datastackConfig connection is established, fetch environment variables
		return await fetchEnvironmentVariablesFromDB();
	} catch (error) {
		logger.error("Error initializing:", error.message);
	}
};

async function connectToAuthorDatabase() {
	try {
		logger.debug('DB Author Type', config.dbAuthorType);
		logger.debug('DB Author URL', config.dbAuthorUrl);
		logger.debug('DB Author Options', config.dbAuthorOptions);
	
		await mongoose.connect(config.dbAuthorUrl, config.dbAuthorOptions);
		mongoose.connection.on('connecting', () => logger.info(' *** Author DB :: Connecting'));
		mongoose.connection.on('disconnected', () => logger.error(' *** Author DB :: connection lost'));
		mongoose.connection.on('reconnect', () => logger.info(' *** Author DB :: Reconnected'));
		mongoose.connection.on('reconnectFailed', () => logger.error(' *** Author DB :: Reconnect attempt failed'));
	
		logger.info('Connected to Author DB');
		logger.trace(`Connected to URL: ${mongoose.connection.host}`);
		logger.trace(`Connected to DB: ${mongoose.connection.name}`);
		logger.trace(`Connected via User: ${mongoose.connection.user}`);
	
		global.dbAuthorConnection = mongoose.connection;
		global.mongoConnectionAuthor = mongoose.connection;
	
		global.dbAuthorConnected = true;
		global.mongoAuthorConnected = true;
	} catch (err) {
		logger.error(err);
		throw err;
	}
}

async function connectToAppcenterDatabase() {
	try {
		logger.info('DB Appcenter Type', config.dbAppcenterType);
		logger.info('DB Appcenter URL', config.dbAppcenterUrl);
		logger.debug('DB Appcenter Options', config.dbAppcenterOptions);
	
		await mongoose.createConnection(config.dbAppcenterUrl, config.dbAppcenterOptions);
	
		global.appcenterDbo = mongoose.connections[1];
		global.dbAppcenterConnection = mongoose.connections[1];
	
		global.mongoAppCenterConnected = true;
		global.dbAppcenterConnected = true;
	
		logger.info('Connected to Appcenter DB');
	} catch (err) {
		logger.error(err);
		throw err;
	}
}

/**
 * Find in the DB
 * @param  {boolean} _isAppCenter
 * @param  {string} _collection
 * @param  {object} _filter
 * @param  {object} _select
 */
e.find = async (_isAppCenter, _collection, _filter, _select) => {
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
			"$unwind": { "path": "$roles", "preserveNullAndEmptyArrays": false }
		}, {
			"$match": { "roles.entity": new RegExp("^SRVC"), "roles.type": "appcenter" }
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
			"$project": { "roles": 1, "app": 1, "entity": 1 }
		}, {
			"$unwind": { "path": "$roles", "preserveNullAndEmptyArrays": false }
		}, {
			"$match": { "roles.operations.method": { "$in": ["POST", "PUT", "DELETE", "REVIEW"] } }
		}, {
			"$group": { "_id": null, "roles": { "$addToSet": "$roles.id" } }
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
			"$unwind": { "path": "$roles", "preserveNullAndEmptyArrays": false }
		}, {
			"$match": { "roles.entity": _entity }
		}
	];
	return await e.aggregateQuery(false, "userMgmt.groups", aggregationPipeline);
};

module.exports = e;