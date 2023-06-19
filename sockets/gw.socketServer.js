'use strict'

const socket = require("socket.io");
const ioClient = require("socket.io-client");

const routingMap = require("../util/routingMap");
const config = require("../config/config.js");

const logger = global.logger;
let socketClients = {};

function __smSocketHandler() {
	let socketClientSM = ioClient.connect(config.get("sm"));

	socketClientSM.on("reconnect", (n) => logger.info("WS :: SM :: Reconnecting to SM " + n));
	socketClientSM.on("reconnect_failed", (n) => logger.info("WS :: SM :: reconnecting to SM failed " + n));
	socketClientSM.on("connect_error", (err) => {
		logger.info("WS :: SM :: Connection error in SM:: " + err.message);
		socketClientSM.close();
	});

	socketClientSM.on("connect", () => {
		logger.info("WS :: SM :: Connected to SM");
		routingMap.createServiceList();
	});

	socketClientSM.on("serviceStatus", (data) => {
		logger.info("WS :: SM :: Service status from Service Manager :", JSON.stringify(data));
		Object.keys(socketClients).forEach(key => {
			socketClients[key].emit("serviceStatus", data);
		});
		logger.info("WS :: SM :: Status update received for " + data.api + " under " + data.app);
		routingMap.updateServiceList(data);
	});

	socketClientSM.on("newService", (data) => {
		logger.info("WS :: SM :: New service from Service Manager :", JSON.stringify(data));
		Object.keys(socketClients).forEach(key => {
			socketClients[key].emit("newService", data);
		});
	});

	socketClientSM.on("deleteService", (data) => {
		logger.info("WS :: SM :: Delete service from Service Manager :", JSON.stringify(data));
		Object.keys(socketClients).forEach(key => {
			socketClients[key].emit("deleteService", data);
		});
		// delete global.masterServiceRouter[escape(data.app) + data.api]
		delete routingMap.deleteServiceList(data);
	});
}

function __bmSocketHander() {
	let socketClientPM = ioClient.connect(config.get("bm"));

	socketClientPM.on("connect", () => {
		logger.info("WS :: BM :: Connected to BM");
		routingMap.createFaasList();
	});
	socketClientPM.on("reconnect", (n) => logger.info("WS :: BM :: Reconnecting to BM " + n));
	socketClientPM.on("reconnect_failed", (n) => logger.error("WS :: BM :: Reconnecting to BM failed " + n));
	socketClientPM.on("connect_error", (err) => {
		logger.error("WS :: BM :: Connection error in BM:: " + err.message);
		socketClientPM.close();
	});

	socketClientPM.on("flowStatus", (data) => {
		logger.info("WS :: BM :: Flow status from B2B Manager :", JSON.stringify(data));
		Object.keys(socketClients).forEach(key => {
			socketClients[key].emit("flowStatus", data);
		});
	});

	socketClientPM.on("flowCreated", (data) => {
		logger.info("WS :: BM :: Flow created from B2B Manager :", JSON.stringify(data));
		Object.keys(socketClients).forEach(key => {
			socketClients[key].emit("flowCreated", data);
		});
	});

	socketClientPM.on("flowDeleted", (data) => {
		logger.info("WS :: BM :: Flow deleted from B2B Manager :", JSON.stringify(data));
		Object.keys(socketClients).forEach(key => {
			socketClients[key].emit("flowDeleted", data);
		});
	});

	socketClientPM.on("interactionCreated", (data) => {
		logger.info("WS :: BM :: Interaction created from B2B Manager :", JSON.stringify(data));
		Object.keys(socketClients).forEach(key => {
			socketClients[key].emit("interactionCreated", data);
		});
	});

	socketClientPM.on("interactionUpdated", (data) => {
		logger.info("WS :: BM :: Interaction updated from B2B Manager :", JSON.stringify(data));
		Object.keys(socketClients).forEach(key => {
			socketClients[key].emit("interactionUpdated", data);
		});
	});

	socketClientPM.on("faasStatus", (data) => {
		logger.info("WS :: BM :: Faas status from B2B Manager :", JSON.stringify(data));
		Object.keys(socketClients).forEach(key => {
			socketClients[key].emit("faasStatus", data);
		});
		routingMap.updateFaasList(data);
	});

	socketClientPM.on("faasCreated", (data) => {
		logger.info("WS :: BM :: Faas created from B2B Manager :", JSON.stringify(data));
		Object.keys(socketClients).forEach(key => {
			socketClients[key].emit("faasCreated", data);
		});
	});

	socketClientPM.on("faasDeleted", (data) => {
		logger.info("WS :: BM :: Faas deleted from B2B Manager :", JSON.stringify(data));
		Object.keys(socketClients).forEach(key => {
			socketClients[key].emit("faasDeleted", data);
		});
		routingMap.deleteFaasList(data);
	});
}


function __cmSocketHander() {
	let socketClientCM = ioClient.connect(config.get("cm"));

	socketClientCM.on("connect", () => {
		logger.info("WS :: CM :: Connected to CM");
	});
	socketClientCM.on("reconnect", (n) => logger.info("WS :: CM :: Reconnecting to CM " + n));
	socketClientCM.on("reconnect_failed", (n) => logger.error("WS :: CM :: Reconnecting to CM failed " + n));
	socketClientCM.on("connect_error", (err) => {
		logger.error("WS :: CM :: Connection error in CM:: " + err.message);
		socketClientCM.close();
	});

	socketClientCM.on("processFlowStatus", (data) => {
		logger.info("WS :: CM :: Process Flow status from Configuration Manager :", JSON.stringify(data));
		Object.keys(socketClients).forEach(key => {
			socketClients[key].emit("processFlowStatus", data);
		});
	});

	socketClientCM.on("processFlowCreated", (data) => {
		logger.info("WS :: CM :: Process Flow created from Configuration Manager :", JSON.stringify(data));
		Object.keys(socketClients).forEach(key => {
			socketClients[key].emit("processFlowCreated", data);
		});
	});

	socketClientCM.on("processFlowDeleted", (data) => {
		logger.info("WS :: CM :: Process Flow deleted from Configuration Manager :", JSON.stringify(data));
		Object.keys(socketClients).forEach(key => {
			socketClients[key].emit("processFlowDeleted", data);
		});
	});

	socketClientCM.on("activityCreated", (data) => {
		logger.info("WS :: CM :: Process Flow Activity created from Configuration Manager :", JSON.stringify(data));
		Object.keys(socketClients).forEach(key => {
			socketClients[key].emit("activityCreated", data);
		});
	});

	socketClientCM.on("activityUpdated", (data) => {
		logger.info("WS :: CM :: Process Flow Activity updated from Configuration Manager :", JSON.stringify(data));
		Object.keys(socketClients).forEach(key => {
			socketClients[key].emit("activityUpdated", data);
		});
	});
}


module.exports = (_server) => {
	let io = socket(_server);

	socketClients = {};
	global.socketClients = socketClients;

	// Connecting to SM and BM
	__smSocketHandler();
	__bmSocketHander();
	__cmSocketHander

	// Handling UI socket connections
	io.on("connection", (socket) => {
		logger.info(`WS :: UI :: ${socket.handshake.query.app} Connected`);
		logger.debug(`WS :: UI :: ${socket.handshake.query.app} :: ${socket.id}`);
		if (socket.handshake.query.app) {
			socketClients[socket.id] = socket;
			global.socketClients = socketClients;
		}

		socket.on("disconnect", () => {
			logger.info(`WS :: UI :: ${socket.handshake.query.app} Disconnected`);
			logger.info(`WS :: UI :: ${socket.id} Disconnected`);
			if (socketClients && socketClients[socket.id]) {
				delete socketClients[socket.id];
				global.socketClients = socketClients;
			}
		});

	});
};