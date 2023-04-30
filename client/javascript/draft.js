
var draft = {
	socket : null,
	season : 0,
	options : {},
	steamid : '',
	teams : [],
	infoTeamId : 0,
	infoTeamRow : null,
	nominee : null,
	amount : 0,
	bidder : null,
	round : 0,
	bidTimer : null,
	timeLeft : 0,
	hideDraftedPlayers : false,
};

ld2l.$.onReady(function() {
	let draftTable = document.getElementById('draft-list');
	draft.season = draftTable.dataset.season;
	draft.steamid = draftTable.dataset.steamid;
	draft.isAuction = draftTable.dataset.auction == "true";
	draft.socket = io('/draft-'+draft.season);

	console.log('new auction=' + draft.isAuction + ' draft for season ' + draft.season);

	draft.socket.on('log', draftLog);

	draft.socket.on('round', function(data) {
		draft.round = data.round;
		if (draft.isAuction)
			renderBidding();
	});

	draft.socket.on('teams', function(data) {
		draft.teams = data.teams;
		updateTeams();
	});

	draft.socket.on('drafted', function(data) {
		let rowset = $('tr[data-steamid="'+data.steamid+'"]');
		rowset[0].dataset.team = data.team;
		rowset[0].dataset.drafted = "1";
		rowset.addClass('drafted');
		if (draft.hideDraftedPlayers)
			rowset.addClass('hide');
		$('tr[data-teamid="'+data.team+'"]').addClass('ld2l-draft-team-drafted');
		$('tr[data-teamid="'+data.team+'"]').removeClass('ld2l-draft-team-next');
	});

	draft.socket.on('next', function(data) {
		console.log('next: '+data.steamid);
		if (data.steamid == draft.steamid) {
			$('input[name="draftButton"]').each(function(k, v) {
				var row = $(v).parent().parent()[0];
				if (row.dataset.team == "0" && v.attributes['disabled']) {
					v.attributes.removeNamedItem('disabled');
				}
			});
		}
	});

	draft.socket.on('nominate', function(data) {
		if (data.nominee)
			console.log(data.by.display_name + ' nominated ' + data.nominee.display_name);
		draft.nominee = data.nominee;
		draft.amount = data.amount || 0;
		draft.bidder = data.by;
		dust.render('bid_buttons', {
			time : data.bidTime,
			nominee : draft.nominee,
		}, function(err, out) {
			document.getElementById('bid_buttons').innerHTML = out;
		});
		updateBidding(data.bidTime);
	});

	draft.socket.on('bid', function(data) {
		draft.amount = data.amount;
		draft.bidder = data.by;
		updateBidding(data.bidTime);
	});

});

function bidTick() {
	draft.timeLeft -= 1;
	if (draft.timeLeft > 0) {
		draft.bidTimer = setTimeout(bidTick, 1000);
		renderTime();
	}
}

function updateBidding(bidTime) {
	if (draft.bidTimer) {
		clearTimeout(draft.bidTimer);
	}

	draft.bidTimer = setTimeout(bidTick, 1000);
	// bid time is given by the server in milliseconds
	draft.timeLeft = bidTime / 1000;
	renderBidding();
}

function renderBidding() {
	dust.render('bid_arena', {
		bidder : draft.bidder,
		nominee : draft.nominee,
		amount : draft.amount,
		time : draft.timeLeft,
	}, function(err, out) {
		document.getElementById('bid_arena').innerHTML = out;
		renderTime();
	});
}

function renderTime() {
	let time = document.getElementById('bid-time');
	if (time)
		time.innerHTML = draft.timeLeft;
}

function updateTeams() {
	dust.render('draftTeams', {
		teams : draft.teams,
		isAuction : draft.isAuction,
		round : draft.round,
	}, function(err, out) {
		document.getElementById('draft-teams').innerHTML = out;
	});
}

function toggleHideDraftedPlayers() {
	let hide = document.getElementById('hidePlayers');
	draft.hideDraftedPlayers = hide.checked;

	let rows = document.getElementsByName('draft-signup');
	rows.forEach(function(row) {
		if (draft.hideDraftedPlayers && row.dataset.drafted == "1")
			row.classList.add('hide');
		else
			row.classList.remove('hide');
	});
}

/**
 * Show team info in the row under a team
 */
function draftTeamInfo(id) {
	if (draft.infoTeamRow) {
		draft.infoTeamRow.remove();
		draft.infoTeamRow = null;

		// Click a second time to close
		if (id == draft.infoTeamId) {
			draft.infoTeamId = -1;
			return;
		}
	}

	var teamIdx = 0;
	draft.teams.forEach(function(v, k) {
		if (v.id == id) {
			teamIdx = k;
		}
	});

	draft.infoTeamId = id;
	dust.render('expandedDraftTeam', {
		players : draft.teams[teamIdx].players,
		isAuction : draft.isAuction,
	}, function(err, out) {
		$('tr[data-teamid="'+id+'"]').after(out);
		draft.infoTeamRow = $('#expandedTeamInfo');
	});
}

function draftLog(messages) {
	$('.ld2l-draft-log').css('display', '');
	let logList = document.getElementById('draft-log');
	messages.forEach(function(v, k) {
		logList.innerHTML = '<li>'+v+'</li>' + logList.innerHTML;
	});
}

function disableButtons() {
	let buttons = document.getElementsByName('draftButton');
	buttons.forEach(function(b) {
		b.attributes.setNamedItem(document.createAttribute('disabled'));
	});
}

function draftPlayer(steamid) {
	console.log('Drafting player '+steamid+' to your team');
	ld2l.$.ajax('/draft/choose/'+draft.season, {
		steamid : steamid
	}).then(disableButtons);
}

function nominate(steamid) {
	console.log('Nominating player '+steamid);
	ld2l.$.ajax('/draft/nominate/'+draft.season, {
		steamid : steamid
	}).then(disableButtons);
}

function bid(amount) {
	console.log('bid ' + amount);
	ld2l.$.ajax('/draft/bid/'+draft.season, {
		amount : amount,
	});
}

function bidIncrement(amount) {
	bid(draft.amount + amount);
}

function bidAmount() {
	bid(parseInt(document.getElementById('amount').value) || 0);
}

function clearMessage() {
	document.getElementById('bid-message').innerHTML = "";
}

function setMessage(msg) {
	document.getElementById('bid-message').innerHTML = msg;
}
