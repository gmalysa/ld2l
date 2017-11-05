/**
 * Wrapper module for loading mysql and configuring it with the database, etc.
 * This also acts to ensure that the singleton instance is initialized only
 * once.
 */

// Module information
var mod_name = 'MySQL';
var mod_version = '0.2.2';

// Node.js modules
require('colors');
var _ = require('underscore');
var mysql = require('mysql');

// Project modules
var logger = require('./logger');

// MySQL configuration
var default_options = {
	host		: 'localhost',
	user		: 'root',
	password	: '',
	database	: 'database'
};

/**
 * Singleton initializer function for mysql glue code
 * @param opts Hash of options for the mysql connection
 */
function init(opts) {
	opts = opts || {};
	this.opts = _.extend({}, default_options, opts);

	this.pool = mysql.createPool(this.opts);
	this.initialized = true;

	logger.module_init(mod_name, mod_version, 'Connected to MySQL server');
	logger.info('Using database '+this.opts.database.green.bold, mod_name);
}

/**
 * Retrieves a connection and filters for errors to reduce the amount of repeated
 * glue-like code in the calling context. Uses the environment handlers for
 * consistency with the rest of the framework
 */
function getValidConnection(env, after) {
	this.pool.getConnection(function(err, conn) {
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
 * @param cb The callback to chain to if necessary
 */
function deinit(cb) {
	if (this.initialized) {
		logger.info('Closing connection pool.', mod_name);
		this.pool.end(cb);
		this.initialized = false;
	}
}

// Public interface for the module and the class
module.exports = init;
init.prototype.deinit = deinit;
init.prototype.getValidConnection = getValidConnection;
