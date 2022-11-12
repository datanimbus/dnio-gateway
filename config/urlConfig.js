"use strict";

module.exports = {
	urlNotPermitted: [
		"/api/a/sm/{app}/service/{id}/statusChange",
		"/api/a/sm/internal/ds/env",
		"api/a/mon/{app}/appcenter/{id}/audit/purge/{type}"
	],
	permittedUrl: [
		"/api/a/rbac/auth/login",
		"/api/a/rbac/auth/ldap/login",
		"/api/a/rbac/auth/azure/login",
		"/api/a/rbac/auth/azure/login/callback",
		"/api/a/rbac/auth/azure/userFetch/callback",
		"/api/a/rbac/auth/authType/{id}",
		"/api/a/rbac/{app}/user/utils/closeAllSessions/{id}",
		"/api/a/bm/auth/login",
		"/api/a/gw/socket-emit",
		"/gw/internal/health/live",
		"/gw/internal/health/ready"
	],
	permittedAuthZUrl: [
		"/api/a/rbac/auth/login",
		"/api/a/rbac/auth/logout",
		"/api/a/rbac/auth/usr/hb",
		"/api/a/route/file/download",
		"/api/a/workflow/file/download",
		"/api/a/rbac/auth/ldap/login",
		"/api/a/rbac/auth/azure/login",
		"/api/a/rbac/auth/azure/login/callback",
		"/api/a/rbac/auth/azure/userFetch/callback",
		"/api/a/rbac/auth/authType/{id)",
		"/api/a/rbac/{app}/user/utils/closeAllSessions/{id}",
		"/api/a/b2bgw/downloadfile",
		"/gw/internal/health/live",
		"/gw/internal/health/ready"
	],
	downloadUrl: [
		"/api/a/bm/{app}/download/{type}/{id}",
		"/api/a/rbac/{app}/user/utils/bulkCreate/download/{id}",
		"/api/a/bm/{app}/download/appagent/{id}/{type}",
		"/api/a/bm/{app}/download/partneragent/{id}/{type}",
		"/api/c/{app}/{api}/utils/export/download/{fileId}"
	]
};