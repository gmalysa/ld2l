
function profile(env, after) {
	env.$template('profile');
	env.$output({
		title : 'Learn Dota 2 League',
		user : env.req.user,
		dotabuff : 'https://www.dotabuff.com/players/'+env.req.user.id32,
		opendota : 'https://www.opendota.com/players/'+env.req.user.id32
	});
	after();
}

module.exports.init_routes = function(server) {
	server.add_route('/profile', {
		fn : profile,
		pre : ['default'],
		post : ['default']
	}, 'get');
}
