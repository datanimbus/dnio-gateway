'use strict';
const log4js = require('log4js');
const mongoose = require('mongoose');

const logger = log4js.getLogger(global.loggerName);

let e = {};


e.aggregate = async (collection, aggregationPipeline) => {
	logger.trace('MongoDB aggregate() on author DB');
	logger.trace(`MongoDB aggregate() : collection : ${collection}`);
	logger.trace(`MongoDB aggregate() : aggregationPipeline : ${JSON.stringify(aggregationPipeline)}`);
	try {
		let docs = await mongoose.connection.collection(collection).aggregate(aggregationPipeline).toArray();
		logger.trace('Permission Found in DB :: ', JSON.stringify(docs));
		return docs;
	} catch (err) {
		logger.error(err);
		throw 'DB lookup error';
	}
};

module.exports = e;