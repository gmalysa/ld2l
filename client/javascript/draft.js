
var draft = {
	socket : null,
	season : 0,
	options : {},
	steamid : '',
	teams : [],
	infoTeamId : 0,
	infoTeamRow : null
};

$(window).load(function() {
	var draftTable= $('table#draft-list')[0];
	draft.season = draftTable.dataset.season;
	draft.steamid = draftTable.dataset.steamid;
	draft.socket = io('/draft-'+draft.season);

	draft.socket.on('log', function(data) {
		console.log('Got a log event');
		console.log(data);
		draftLog(data);
	});

	draft.socket.on('round', function(data) {
		console.log(data);
		draft.teams = data.teams;
		dust.render('draftTeams', data, function(err, out) {
			$('#draft-teams').html(out);
		});
	});

	draft.socket.on('drafted', function(data) {
		$('tr[data-steamid="'+data.steamid+'"]')[0].dataset.team = data.team;
		$('tr[data-steamid="'+data.steamid+'"]').addClass('drafted');
		$('tr[data-teamid="'+data.team+'"]').addClass('ld2l-draft-team-drafted');
		$('tr[data-teamid="'+data.team+'"]').removeClass('ld2l-draft-team-next');
	});

	draft.socket.on('team', function(data) {
		draft.teams.forEach(function(v) {
			if (v.id == data.id) {
				v.players = data.players,
				v.medal = data.medal;
			}
			var row = $('tr[data-teamid="'+data.id+'"]');
			var td = row.children()[2];
			$(td).html(data.medal);
		});
	});

	draft.socket.on('next', function(data) {
		console.log('next: '+data.steamid);
		$('tr[data-teamid="'+data.team+'"]').addClass('ld2l-draft-team-next');
		if (data.steamid == draft.steamid) {
			$('input[name="draftButton"]').each(function(k, v) {
				var row =$(v).parent().parent()[0];
				if (row.dataset.team == "0") {
					$(v).prop('disabled', false);
				}
			});
		}
	});
});

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
	dust.render('expandedDraftTeam', draft.teams[teamIdx], function(err, out) {
		$('tr[data-teamid="'+id+'"]').after(out);
		draft.infoTeamRow = $('#expandedTeamInfo');
	});
}

function draftLog(messages) {
	$('.ld2l-draft-log').css('display', '');
	var logList = $('#draft-log');
	messages.forEach(function(v, k) {
		logList.append('<li>'+v+'</li>');
	});
}

function draftPlayer(steamid) {
	console.log('Drafting player '+steamid+' to your team');
	$('input[name="draftButton"]').prop('disabled', true);
	$.ajax({
		url : '/draft/choose/'+draft.season,
		data : {
			steamid : steamid
		},
		method : 'POST',
		dataType : 'json'
	}).done(function(data, status, xhr) {

	});
}
