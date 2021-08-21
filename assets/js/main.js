const API_URI = "https://api.tmsqd.co/";
const WS_URI = "wss://ws.tmsqd.co/";
const DISCORD_AVATAR_URI = "https://cdn.discordapp.com/";

let ws = null;

let traceList = {};

function sendNotification(title, description, classes = "notification-primary", length = 6000) {
    if ($(".notifications").length === 0) {
        $("body").append("<div class=\"notifications\"></div>");
    }

    let notification = $(`<div class="notification ${classes}" style="display: none;"><div class="header">${title}</div><div>${description}</div></div>`);
    $(".notifications").append(notification);

    notification.fadeIn(200);

    setTimeout(function() {
        notification.slideUp(200);

        setTimeout(function() {
            notification.remove();
        }, 250)
    }, length + 200);
}

let eventListeners = {
    ["streamer-list-updated"]: function(data) {
        sendNotification("Your streamer list was updated!", "The list of streamers are fresh from Twitch. <a href=\"#\" onclick=\"navigate('authorized-channels', '/you/authorized-channels.html');return false;\">Click here to check them out!</a>");
        emit("streamersChange", [data]);
    }
};

function initWS() {
    ws = new WebSocket(WS_URI);

    ws.json = function(object) {
        ws.send(JSON.stringify(object));
    }

    ws.request = function(object) {
        return new Promise((resolve, reject) => {
            object.trace = makeid(8);
            ws.json(object);

            traceList[object.trace] = function(data) {
                resolve(data);
            }

            setTimeout(function() {
                delete traceList[object.trace];
                reject("Request Timeout");
            }, 10000);
        });
    }

    ws.onopen = async function() {
        let authorizeWS = await ws.request({type: "auth", session: readCookie("session")});

        if (authorizeWS.success) {
            if (authorizeWS.hasOwnProperty("identity")) {
                if (authorizeWS.identity.profiles.discord.length === 0) {
                    sendNotification("Finish authorizing your account!", "We don't have a Discord account on record for your user.<br/><a href=\"https://tmsqd.co/discord\">Link your Discord acount here.</a>", undefined, 60000);
                } else if (authorizeWS.identity.profiles.twitch.length === 0) {
                    sendNotification("Finish authorizing your account!", "We don't have a Twitch account on record for your user.<br/><a href=\"https://tmsqd.co/twitch\">Link your Twitch acount here.</a>", undefined, 60000);
                }
            }
        } else {
            if (authorizeWS.hasOwnProperty("error") && authorizeWS.error === "Session not found") {
                window.location = "https://tmsqd.co/";
                return;
            }
            alert("Received unknown error: " + authorizeWS.error)
        }
    }

    ws.onclose = function() {
        console.log("Websocket Closed. Reconnecting");
        initWS();
    }

    ws.onmessage = function(message) {
        try {
            let json = JSON.parse(message.data);

            if (json.hasOwnProperty("trace") && traceList.hasOwnProperty(json.trace)) {
                traceList[json.trace](json);
                return;
            }

            if (json.hasOwnProperty("type") && eventListeners.hasOwnProperty(json.type)) {
                eventListeners[json.type](json.data);
                return;
            }

            console.log("Unknown request", json);
        } catch (err) {
            console.error(err);
        }
    }
}

function makeid(length) {
    let result = '';
    let characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let charactersLength = characters.length;
    for (let i = 0; i < length; i++ ) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}

function comma(x) {
    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

const listeners = {
    profileImageChange: [
        function(avatar) {
            // update global picture
            $(".profile-picture").attr("src", avatar);
        },
    ],
    twitchAccountsChange: [
        function(accounts) {

            let table = `<table>`;

            if (accounts.length === 0) {
                table += "<tr><th style=\"text-align: center;\">No data.</th></tr>";
            }

            accounts.forEach(account => {
                table += `
                <tr class="account-row">
                    <td><img class="rounded-square-avatar" src="${account.profile_image_url}" alt="Profile picture for Twitch user '${account.display_name}'"></td>
                    <td>
                        <span class="account-name">${account.display_name}${account.affiliation === "partner" ? '&nbsp;<i class=\"fas fa-badge-check\"></i></span>' : ''}</span>
                        <span class="account-stats">${account.follower_count !== null ? `<span class="highlight">${comma(account.follower_count)}</span> follower${account.follower_count === 1 ? '' : 's'} • ` : ''}${account.view_count !== null ? `<span class="highlight">${comma(account.view_count)}</span> views • ` : ''}User ID <span class="highlight">${account.id}</span>${account.affiliation === null ? '' : (account.affiliation === "partner" ? " • <span class=\"highlight\">Partner <i class=\"far fa-badge-check\"></i></span>" : " • <span class=\"highlight\">Affiliate</span>")}</span>
                    </td>
                </tr>`;
            });

            table += '</table>';
            // update linked accounts list
            $(".twitch-accounts").html(table);
        }
    ],
    discordAccountsChange: [
        function(accounts) {

            let table = `<table>`;

            if (accounts.length === 0) {
                table += "<tr><th style=\"text-align: center;\">No data.</th></tr>";
            }

            accounts.forEach(account => {
                let pfp = null;

                if (account.avatar !== null) {
                    pfp = DISCORD_AVATAR_URI + "avatars/" + account.id + "/" + account.avatar + ".png";
                } else {
                    pfp = DISCORD_AVATAR_URI + "embed/avatars/" + account.discriminator + ".png";
                }

                table += `
                <tr class="account-row">
                    <td><img class="rounded-square-avatar" src="${pfp}" alt="Profile picture for Discord user '${account.name}'"></td>
                    <td>
                        <span class="account-name">${account.name}</span>
                        <span class="account-stats">Tag <span class="highlight">${account.name + "#" + account.discriminator}</span> • User ID <span class="highlight">${account.id}</span></span>
                    </td>
                </tr>`;
            });

            table += '</table>';
            // update linked accounts list
            $(".discord-accounts").html(table);
        }
    ],
    streamersChange: [
        function(streamers) {
            let identities = `<table>`;
            let twitch = `<table>`;
            let discord = `<table>`;

            if (streamers.length === 0) {
                identities += "<tr><th style=\"text-align: center;\">No data.</th></tr>";
            }

            streamers.forEach(streamer => {
                identities += `
                <tr class="account-row">
                    <td><img class="rounded-square-avatar" src="${streamer.avatar_url}" alt="Profile picture for Identity '${streamer.name}'"></td>
                    <td>
                        <span class="account-name">${streamer.name}</span>
                        <span class="account-stats"><span class="highlight">${streamer.profiles.twitch.length}</span> twitch account${streamer.profiles.twitch.length === 1 ? "" : "s"} • <span class="highlight">${streamer.profiles.discord.length}</span> discord account${streamer.profiles.discord.length === 1 ? "" : "s"} • Identity ID <span class="highlight">${streamer.id}</span></span>
                    </td>
                </tr>`;


                streamer.profiles.twitch.forEach(account => {
                    twitch += `
                    <tr class="account-row">
                        <td><img class="rounded-square-avatar" src="${account.profile_image_url}" alt="Profile picture for Twitch user '${account.display_name}'"></td>
                        <td>
                            <span class="account-name">${account.display_name}${account.affiliation === "partner" ? '&nbsp;<i class=\"fas fa-badge-check\"></i></span>' : ''}</span>
                            <span class="account-stats">${account.follower_count !== null ? `<span class="highlight">${comma(account.follower_count)}</span> follower${account.follower_count === 1 ? '' : 's'} • ` : ''}${account.view_count !== null ? `<span class="highlight">${comma(account.view_count)}</span> views • ` : ''}User ID <span class="highlight">${account.id}</span>${account.affiliation === null ? '' : (account.affiliation === "partner" ? " • <span class=\"highlight\">Partner <i class=\"far fa-badge-check\"></i></span>" : " • <span class=\"highlight\">Affiliate</span>")}</span>
                        </td>
                    </tr>`;
                });

                streamer.profiles.discord.forEach(account => {
                    let pfp = null;
    
                    if (account.avatar !== null) {
                        pfp = DISCORD_AVATAR_URI + "avatars/" + account.id + "/" + account.avatar + ".png";
                    } else {
                        pfp = DISCORD_AVATAR_URI + "embed/avatars/" + account.discriminator + ".png";
                    }
    
                    discord += `
                    <tr class="account-row">
                        <td><img class="rounded-square-avatar" src="${pfp}" alt="Profile picture for Discord user '${account.name}'"></td>
                        <td>
                            <span class="account-name">${account.name}</span>
                            <span class="account-stats">Tag <span class="highlight">${account.name + "#" + account.discriminator}</span> • User ID <span class="highlight">${account.id}</span></span>
                        </td>
                    </tr>`;
                });
            });

            if (twitch === "<table>") {
                twitch += "<tr><th style=\"text-align: center;\">No data.</th></tr>";
            }

            if (discord === "<table>") {
                discord += "<tr><th style=\"text-align: center;\">No data.</th></tr>";
            }

            identities += '</table>';
            twitch += '</table>';
            discord += '</table>';

            $(".authorized-identities").html(identities);
            $(".authorized-twitch").html(twitch);
            $(".authorized-discord").html(discord);
        }
    ],
    statusChange: [
        function(status) {
            let moduleCode = `<div class="container-fluid"><div class="row">`;
            status.forEach((node, i) => {
                if (i % 2 === 0 && i !== 0) {
                    moduleCode += `</div><div class="row">`;
                }

                moduleCode += `<div class="col col-lg-6"><section>
                <h3>
                    TMI Node #${node.id}
                    <small>All channels being listened to by node #${node.id}.</small>
                </h3>
    
                <div class="channel-status"><table>`;
                node.channels.forEach(account => {
                    moduleCode += `
                    <tr class="account-row">
                        <td><img class="rounded-square-avatar" src="${account.profile_image_url}" alt="Profile picture for Twitch user '${account.display_name}'"></td>
                        <td>
                            <span class="account-name">${account.display_name}${account.affiliation === "partner" ? '&nbsp;<i class=\"fas fa-badge-check\"></i></span>' : ''}</span>
                            <span class="account-stats">${account.follower_count !== null ? `<span class="highlight">${comma(account.follower_count)}</span> follower${account.follower_count === 1 ? '' : 's'} • ` : ''}${account.view_count !== null ? `<span class="highlight">${comma(account.view_count)}</span> views • ` : ''}User ID <span class="highlight">${account.id}</span>${account.affiliation === null ? '' : (account.affiliation === "partner" ? " • <span class=\"highlight\">Partner <i class=\"far fa-badge-check\"></i></span>" : " • <span class=\"highlight\">Affiliate</span>")}</span>
                        </td>
                    </tr>`;
                });
                moduleCode += `</table></div></section></div>`;
            });
            moduleCode += "</div></div>";
            $(".bot-status").html(moduleCode);
        }
    ],
}

function emit(event, params) {
    if (typeof(params) !== "object") params = [params];

    if (listeners[event]) {
        listeners[event].forEach(function(listener) {
            listener(...params);
        });
    }
}

// https://stackoverflow.com/questions/1599287/create-read-and-erase-cookies-with-jquery
function createCookie(name, value, days) {
    if (days) {
        var date = new Date();
        date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
        var expires = "; expires=" + date.toGMTString();
    }
    else var expires = "";               

    document.cookie = name + "=" + value + expires + "; path=/";
}

function readCookie(name) {
    var nameEQ = name + "=";
    var ca = document.cookie.split(';');
    for (var i = 0; i < ca.length; i++) {
        var c = ca[i];
        while (c.charAt(0) == ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length, c.length);
    }
    return null;
}

function eraseCookie(name) {
    createCookie(name, "", -1);
}

const api = {
    get: function(uri, callback) {
        $.ajax({
            type: "GET",
            url: API_URI + uri,
            headers: {
                "Authorization": readCookie("session")
            },
            success: callback
        });
    }
}

const navigate = function(url) {
    let page = url.replace("#/", '').replace("/", "-");

    console.log(url, page);
    $("body").removeClass("menu-open");

    $(".sidebar-nav a").removeClass("active");
    $(`.${page}-link`).addClass("active");

    if ($("h2 span").text() !== $(`.${page}-link`).text()) {
        let h2 = $("h2");
        let oldspan = $("h2 span");
        let newspan = $("<span class=\"new\">" + $(`.${page}-link`).text() + "</span>");

        h2.append(newspan);

        oldspan.addClass("old");

        setTimeout(function(){newspan.removeClass("new");}, 10);
        setTimeout(function(){oldspan.remove();}, 250);
    }

    $("article").hide();
    $(`.${page}`).show();

    history.pushState({page: page, url: url}, "TMS Admin Panel", url);
}

$(document).ready(function() {
    initWS();

    api.get("identity", function(data) {
        if (data.success) {
            emit("twitchAccountsChange", [data.data.profiles.twitch]);
            emit("discordAccountsChange", [data.data.profiles.discord]);
            if (data.data.profiles.discord.length > 0) {
                emit("profileImageChange", data.data.avatar_url);
            } else if (data.data.profiles.twitch.length > 0) {
                if (data.data.profiles.twitch[0].profile_image_url) {
                    emit("profileImageChange", data.data.profiles.twitch[0].profile_image_url);
                }
            }
        } else {
            console.error(data.error);
        }
    });

    api.get("streamers", function(data) {
        if (data.success) {
            emit("streamersChange",[data.data]);
        }
    });

    api.get("status", function(data) {
        if (data.success) {
            emit("statusChange",[data.data]);
        }
    });

    $(".add-twitch-profile").click(function() {
        if (confirm('Twitch will not prompt you to change your login account. Go to Twitch and verify this is the account you\'d like to add prior to continuing.\n\nIf your logged in account is the same account that you use to login here, you will just be sent back to this page.')) {
            window.location = "https://tmsqd.co/twitch";
        }

        return false;
    });

    $("a.not-registered").click(function() {
        let ele = $(this);
        navigate(ele.attr("href"));
        return false;
    });

    $("a.not-registered").removeClass("not-registered");
    $("h1").click(function(){$("body").removeClass("menu-open");});
    $(".hamburger-menu").click(function(){$("body").toggleClass("menu-open");return false;});

    navigate(window.location.hash);
});

window.onpopstate = function(event) {
    if (event.state && event.state.page && event.state.url) {
        navigate(event.state.url);
    }
};
