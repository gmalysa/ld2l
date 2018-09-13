/**
 * Wrapper module for loading mysql and configuring it with the database, etc.
 * This also acts to ensure that the singleton instance is initialized only
 * once.
 */

// Module information
var mod_name = 'MySQL';
var mod_version = '0.4.0';

// Node.js modules
require('colors');
var _ = require('underscore');
var mysql = require('mysql');
var db = require('db-filters');

// Project modules
var logger = require('./logger');
var config = require('./config.js');

var initialized = false;
var pool = {};

/**
 * Retrieves a connection and filters for errors to reduce the amount of repeated
 * glue-like code in the calling context. Uses the environment handlers for
 * consistency with the rest of the framework
 */
function getValidConnection(env, after) {
	pool.getConnection(function(err, conn) {
		if (err) {
			err._msg = 'Error connecting to MySQL database.';
			env.$throw(err);
		}
		else {
			env.conn = conn;
			after();
		}
	});
}

/**
 * Singleton cleanup function, called on process exit
 * @param cb The callback to chain to
 */
function deinit(cb) {
	if (initialized) {
		logger.info('Closing connection pool.', mod_name);
		initialized = false;
		pool.end(cb);
	}
}

/**
 * Singleton initialization function, called whereever
 */
function init() {
	if (!initialized) {
		pool = mysql.createPool(config.mysql);
		initialized = true;
		logger.module_init(mod_name, mod_version, 'Configured MySQL connection pool');
		logger.info('Using database '+config.mysql.database.green.bold, mod_name);
	}
}

/**
 * Cleans up the database connection assigned to a specific environment/request
 */
function cleanup_db(env, after) {
	if (env.conn) {
		env.conn.release();
		delete env.conn;
	}
	after();
}

/**
 * Initialize database connection from the mysql pool for a specific environment/request
 */
function init_db(env, after) {
	env.filters = db.clone_filters(db.filters);

	mysql.getValidConnection(env, function() {
		db.set_conn_all(env.conn, env.filters);
		after();
	});
}

// Public interface for the module and the class
module.exports = {
	init : init,
	cleanup : deinit,
	getValidConnection : getValidConnection,
	init_db : init_db,
	cleanup_db : cleanup_db
};
