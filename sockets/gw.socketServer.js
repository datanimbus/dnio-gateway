'use strict'

const socket = require("socket.io")
const ioClient = require("socket.io-client")

const routingMap = require("../util/routingMap")
const config = require("../config/config.js")

function __smSocketHandler(){
	let socketClientSM = ioClient.connect(config.get("sm"))

	socketClientSM.on("reconnect", (n) => logger.info("WS :: Reconnecting to SM " + n))
	socketClientSM.on("reconnect_failed", (n) => logger.info("WS :: reconnecting to SM failed " + n))
	socketClientSM.on("connect_error", (err) => logger.info("WS :: Connection error in SM:: " + err.message))

	socketClientSM.on("connect", () => {
		logger.info("WS :: Connected to SM")
		routingMap.createServiceList()
	})

	socketClientSM.on("serviceStatus", (data) => {
		logger.info("serviceStatus from Service Manager :", JSON.stringify(data))
		Object.keys(socketClients).forEach(key => {
			socketClients[key].emit("serviceStatus", data)
		})
		logger.info("Status update received for " + data.api + " under " + data.app)
		routingMap.updateServiceList(data)
	})

	socketClientSM.on("newService", (data) => {
		logger.info("newService from Service Manager :", JSON.stringify(data))
		Object.keys(socketClients).forEach(key => {
			socketClients[key].emit("newService", data)
		})
	})

	socketClientSM.on("deleteService", (data) => {
		logger.info("deleteService from Service Manager :", JSON.stringify(data))
		Object.keys(socketClients).forEach(key => {
			socketClients[key].emit("deleteService", data)
		})
		// delete global.masterServiceRouter[escape(data.app) + data.api]
		delete e.deleteServiceList(data)
	})
}

function __pmSocketHander(){
	let socketClientPM = ioClient.connect(config.get("pm"))

	socketClientPM.on("connect", () => logger.info("WS :: Connected to PM"))
	socketClientPM.on("reconnect", (n) => logger.info("WS :: Reconnecting to PM " + n))
	socketClientPM.on("reconnect_failed", (n) => logger.error("WS :: reconnecting to PM failed " + n))
	socketClientPM.on("connect_error", (err) => logger.error("WS :: Connection error in PM:: " + err.message))

	socketClientPM.on("flowStatus", (data) => {
		logger.info("flowStatus from Partner Manager :", JSON.stringify(data))
		Object.keys(socketClients).forEach(key => {
			socketClients[key].emit("flowStatus", data)
		})
	})

	socketClientPM.on("flowCreated", (data) => {
		logger.info("flowCreated from Partner Manager :", JSON.stringify(data))
		Object.keys(socketClients).forEach(key => {
			socketClients[key].emit("flowCreated", data)
		})
	})

	socketClientPM.on("flowDeleted", (data) => {
		logger.info("flowDeleted from Partner Manager :", JSON.stringify(data))
		Object.keys(socketClients).forEach(key => {
			socketClients[key].emit("flowDeleted", data)
		})
	})

	socketClientPM.on("interactionCreated", (data) => {
		logger.info("interactionCreated from Partner Manager :", JSON.stringify(data))
		Object.keys(socketClients).forEach(key => {
			socketClients[key].emit("interactionCreated", data)
		})
	})

	socketClientPM.on("interactionUpdated", (data) => {
		logger.info("interactionUpdated from Partner Manager :", JSON.stringify(data))
		Object.keys(socketClients).forEach(key => {
			socketClients[key].emit("interactionUpdated", data)
		})
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
		logger.debug(`Socket: ${JSON.stringify(socket)}`)
		logger.info("Socket Connected :", socket.id)
		if (socket.handshake.query.app) {
			socketClients[socket.id] = socket
			global.socketClients = socketClients
		}

		socket.on("disconnect", () => {
			logger.info("Socket Disconnected :", socket.id)
			if (socketClients && socketClients[socket.id]) {
				delete socketClients[socket.id]
				global.socketClients = socketClients
			}
		})

	})
}