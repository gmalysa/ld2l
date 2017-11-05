/**
 * Main server entry point, this configures express and attaches the relevant pathes,
 * most of which are defined in other files.
 */

// Configuration options
var mod_name = 'ld2l';
var mod_version = '0.1.0';
var config = require('./config.json');
var port = config.port || 8124;
var env = config.env || 'development';

// node.js and other libraries
require('colors');
var express = require('express');
var db = require('db-filters');
var fl = require('flux-link');

// Private libraries
var logger = require('./logger');
var mysql = require('./mysql');
var common = require('./common');

/**
 * Gets a connection from the mysql pool and clones instances
 * of database filter objects for our use. This is generally
 * the first step in handling any request.
 */
function init_db(env, after) {
	env.filters = db.clone_filters(db.filters);

	mysql.getValidConnection(env, function() {
		db.set_conn_all(env.conn, env.filters);
		after();
	});
}

/**
 * Cleans up the database connection
 */
function cleanup_db(env, after) {
	if (env.conn)
		env.conn.release();
	after();
}

// Initialize mysql
var mysql = new mysql({
	database : config.mysql_database,
	user : config.mysql_user,
	password : config.mysql_password
});

db.init(process.cwd() + '/filters', function(file) {
	logger.info('Adding database definition ' + file.blue.bold + '...', 'db-filters');
}, db.l_info);

db.set_log(function(msg) {
	logger.info(msg, 'db-filters');
});

// Initialize the common server
var server = express();

var ci = new common.init(server, {
	port			: port,
	set				: {env : env},
	shutdown		: [{fn : mysql.deinit, ctx : mysql}],
	base_url		: config.url,
	session_secret	: config.session_secret,
	steam_api_key	: config.steam_api_key
});

// Add helpers and hooks
ci.add_pre_hook(fl.mkfn(init_db, 0));
ci.add_post_hook(fl.mkfn(cleanup_db, 0));

// Finally!
logger.module_init(mod_name, mod_version, 'ld2l online');
