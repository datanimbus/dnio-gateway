'use strict'

const socket = require("socket.io")
const ioClient = require("socket.io-client")

const routingMap = require("../util/routingMap")
const config = require("../config/config.js")

function __smSocketHandler(){
	let socketClientSM = ioClient.connect(config.get("sm"))

	socketClientSM.on("reconnect", (n) => logger.info("WS :: SM :: Reconnecting to SM " + n))
	socketClientSM.on("reconnect_failed", (n) => logger.info("WS :: SM :: reconnecting to SM failed " + n))
	socketClientSM.on("connect_error", (err) => logger.info("WS :: SM :: Connection error in SM:: " + err.message))

	socketClientSM.on("connect", () => {
		logger.info("WS :: SM :: Connected to SM")
		routingMap.createServiceList()
	})

	socketClientSM.on("serviceStatus", (data) => {
		logger.info("WS :: SM :: Service status from Service Manager :", JSON.stringify(data))
		Object.keys(socketClients).forEach(key => {
			socketClients[key].emit("serviceStatus", data)
		})
		logger.info("WS :: SM :: Status update received for " + data.api + " under " + data.app)
		routingMap.updateServiceList(data)
	})

	socketClientSM.on("newService", (data) => {
		logger.info("WS :: SM :: New service from Service Manager :", JSON.stringify(data))
		Object.keys(socketClients).forEach(key => {
			socketClients[key].emit("newService", data)
		})
	})

	socketClientSM.on("deleteService", (data) => {
		logger.info("WS :: SM :: Delete service from Service Manager :", JSON.stringify(data))
		Object.keys(socketClients).forEach(key => {
			socketClients[key].emit("deleteService", data)
		})
		// delete global.masterServiceRouter[escape(data.app) + data.api]
		delete routingMap.deleteServiceList(data)
	})
}

function __pmSocketHander(){
	let socketClientPM = ioClient.connect(config.get("pm"))

	socketClientPM.on("connect", () => {
		logger.info("WS :: PM :: Connected to PM");
		routingMap.createFaasList();
	});
	socketClientPM.on("reconnect", (n) => logger.info("WS :: PM :: Reconnecting to PM " + n))
	socketClientPM.on("reconnect_failed", (n) => logger.error("WS :: PM :: Reconnecting to PM failed " + n))
	socketClientPM.on("connect_error", (err) => logger.error("WS :: PM :: Connection error in PM:: " + err.message))

	socketClientPM.on("flowStatus", (data) => {
		logger.info("WS :: PM :: Flow status from Partner Manager :", JSON.stringify(data))
		Object.keys(socketClients).forEach(key => {
			socketClients[key].emit("flowStatus", data)
		})
	})

	socketClientPM.on("flowCreated", (data) => {
		logger.info("WS :: PM :: Flow created from Partner Manager :", JSON.stringify(data))
		Object.keys(socketClients).forEach(key => {
			socketClients[key].emit("flowCreated", data)
		})
	})

	socketClientPM.on("flowDeleted", (data) => {
		logger.info("WS :: PM :: Flow deleted from Partner Manager :", JSON.stringify(data))
		Object.keys(socketClients).forEach(key => {
			socketClients[key].emit("flowDeleted", data)
		})
	})

	socketClientPM.on("interactionCreated", (data) => {
		logger.info("WS :: PM :: Interaction created from Partner Manager :", JSON.stringify(data))
		Object.keys(socketClients).forEach(key => {
			socketClients[key].emit("interactionCreated", data)
		})
	})

	socketClientPM.on("interactionUpdated", (data) => {
		logger.info("WS :: PM :: Interaction updated from Partner Manager :", JSON.stringify(data))
		Object.keys(socketClients).forEach(key => {
			socketClients[key].emit("interactionUpdated", data)
		})
	})

	socketClientPM.on("faasStatus", (data) => {
		logger.info("WS :: PM :: Faas status from Partner Manager :", JSON.stringify(data))
		Object.keys(socketClients).forEach(key => {
			socketClients[key].emit("faasStatus", data)
		});
		routingMap.updateFaasList(data);
	})

	socketClientPM.on("faasCreated", (data) => {
		logger.info("WS :: PM :: Faas created from Partner Manager :", JSON.stringify(data))
		Object.keys(socketClients).forEach(key => {
			socketClients[key].emit("faasCreated", data)
		})
	})

	socketClientPM.on("faasDeleted", (data) => {
		logger.info("WS :: PM :: Faas deleted from Partner Manager :", JSON.stringify(data))
		Object.keys(socketClients).forEach(key => {
			socketClients[key].emit("faasDeleted", data)
		});
		routingMap.deleteFaasList(data);
	})
}

module.exports = (_server) => {
	let io = socket(_server)

	var socketClients = {}
	global.socketClients = socketClients;

	// Connecting to SM and PM
	__smSocketHandler();
	__pmSocketHander();

	// Handling UI socket connections
	io.on("connection", (socket) => {
		logger.info(`WS :: UI :: ${socket.handshake.query.app} Connected`)
		logger.debug(`WS :: UI :: ${socket.handshake.query.app} :: ${socket.id}`)
		if (socket.handshake.query.app) {
			socketClients[socket.id] = socket
			global.socketClients = socketClients
		}

		socket.on("disconnect", () => {
			logger.info(`WS :: UI :: ${socket.handshake.query.app} Disconnected`)
			logger.info(`WS :: UI :: ${socket.id} Disconnected`)
			if (socketClients && socketClients[socket.id]) {
				delete socketClients[socket.id]
				global.socketClients = socketClients
			}
		})

	})
}