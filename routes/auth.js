var _ = require('underscore');
var db = require('db-filters');
var fl = require('flux-link');
var BigNumber = require('bignumber.js');

var logger = require('../logger');
var config = require('../config');
var mysql = require('../mysql');

var users = require('../lib/users.js');

var passport = require('passport');
var steamStrategy = require('passport-steam');
var discordStrategy = require('passport-discord');

// Passport basic config
passport.serializeUser(function(user, done) {
	done(null, user);
});

passport.deserializeUser(function(obj, done) {
	done(null, obj);
});

/**
 * We don't have access to the init_db function defined in server.js so it needs to be duplicated
 * here for now.
 */
function init_db(env, after) {
	env.filters = db.clone_filters(db.filters);

	mysql.getValidConnection(env, function() {
		db.set_conn_all(env.conn, env.filters);
		after();
	});
}

// Load or create a user entry
var steamChain = new fl.Chain(
	init_db,
	function(env, after) {
		after(env.profile.id);
	},
	users.addUser
);

// Set up passport for steam login info
passport.use(new steamStrategy({
	returnURL : config.base_url + '/auth/steam/return',
	realm : config.base_url,
	apiKey : config.steam_api_key
}, function(id, profile, done) {
	logger.info('Received steam ID: ' +id, 'Steam');

	var env = new fl.Environment();
	env.profile = profile;

	steamChain.call(null, env, function(user) {
		env.user = user;
		done(null, user);
	});
}));

// Add or update discord information in an entry
var discordChain = new fl.Chain(
	init_db,
	function(env, after) {
		env.filters.users.update({
			discord_id : env.user.discord_id,
			discord_name : env.user.discord_name,
			discord_avatar : env.user.discord_avatar,
			discord_discriminator : env.user.discord_discriminator
		}, {
			steamid : env.user.steamid
		}).exec(after, env.$throw);
	}
);

// Set up passport to link discord profile to existing steam account
passport.use(new discordStrategy({
	clientID : config.discord_client_id,
	clientSecret : config.discord_client_secret,
	callbackURL : config.base_url + '/auth/discord/return',
	scope : 'identify',
	passReqToCallback : true
}, function(req, accessToken, refreshToken, profile, done) {
	req.user.discord_id = profile.id;
	req.user.discord_name = profile.username;
	req.user.discord_discriminator = profile.discriminator;
	req.user.discord_avatar = profile.avatar;

	var env = new fl.Environment();
	env.user = req.user;
	discordChain.call(null, env, function() { done(null, profile) });
}));

function addUserOutput(env, after) {
	if (env.req.user && env.req.user.steamid) {
		env.user = env.req.user;
		env.$output({user : env.user});
	}
	after();
}

// Bind to provided express instance at init time
module.exports.init_routes = function(common) {
	common.server.get(
		'/auth/steam',
		passport.authenticate('steam', { failureRedirect : '/' }),
		function(req, res) { res.redirect('/'); }
	);
	common.server.get(
		'/auth/steam/return',
		passport.authenticate('steam', { failureRedirect : '/' }),
		function(req, res) { res.redirect('/'); }
	);

	common.server.get(
		'/auth/discord',
		passport.authorize('discord', { failureRedirect : '/' }),
		function(req, res) { res.redirect('/'); }
	);
	common.server.get(
		'/auth/discord/return',
		passport.authorize('discord', { failureRedirect : '/profile' }),
		function(req, res) {
			res.redirect('/profile');
		}
	);

	common.add_pre_hook(fl.mkfn(addUserOutput, 0));
};
