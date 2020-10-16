"use strict";

module.exports = {
	urlNotPermitted: [
		"/api/a/sm/service/{id}/statusChange",
		"/api/a/sm/app/{app}",
		"/api/a/rbac/service/{id}",
		"api/a/mon/appcenter/{id}/audit/purge/{type}",
	],
	permittedUrl: [
		"/api/a/rbac/login",
		"/api/a/rbac/azure/login",
		"/api/a/rbac/azure/login/callback",
		"/api/a/rbac/azure/userFetch/callback",
		"/api/a/rbac/authType/{id}",
		"/api/a/rbac/closeAllSessions",
		"/gw/health/live",
		"/gw/health/ready"
	],
	permittedAuthZUrl: [
		"/api/a/rbac/login",
		"/api/a/rbac/logout",
		"/api/a/rbac/usr/hb",
		"/api/a/route/file/download",
		"/api/a/workflow/file/download",
		"/api/a/rbac/azure/login",
		"/api/a/rbac/azure/login/callback",
		"/api/a/rbac/azure/userFetch/callback",
		"/api/a/rbac/authType",
		"/api/a/rbac/closeAllSessions",
		"/api/a/b2bgw/downloadfile",
		"/gw/health/live",
		"/gw/health/ready"
	],
	downloadUrl: [
		"/api/a/workflow/file/download",
		"/api/a/route/file/download",
		"/api/a/b2bgw/downloadfile",
		"/api/a/pm/{app}/download/{type}/{id}",
		"/api/a/rbac/usr/bulkCreate/{id}/download",
		"/api/a/pm/ieg/download/{type}",
		"/api/a/pm/{app}/download/appagent/{id}/{type}",
		"/api/a/pm/{app}/download/partneragent/{id}/{type}",
		"/api/a/sec/identity/{appName}/fetch/download",
		"/api/a/sec/identity/{appName}/csr",
		"/api/a/sec/identity/{appName}/certificate/download",
		"/api/a/sec/keys/download/IEG",
		"/api/a/sec/keys/download/CA",
		"/api/c/{app}/{api}/utils/export/download/{fileId}"
	],
	secret: {
		partner: [
			"/api/a/sec/pm/{partnerId}/secret/enc",
			"/api/a/sec/pm/{partnerId}/secret/dec/{secretId}",
			"/api/a/sec/pm/{partnerId}/secret/{secretId}"
		]
	}
};