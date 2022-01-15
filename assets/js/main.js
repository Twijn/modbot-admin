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
    },
    ["no-action-notification"]: function(data) {
        sendNotification(data.title, data.description);
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
                if (authorizeWS.identity.discordAccounts.length === 0) {
                    sendNotification("Finish authorizing your account!", "We don't have a Discord account on record for your user.<br/><a href=\"https://api.tmsqd.co/auth/discord\">Link your Discord acount here.</a>", undefined, 60000);
                } else if (authorizeWS.identity.twitchAccounts.length === 0) {
                    sendNotification("Finish authorizing your account!", "We don't have a Twitch account on record for your user.<br/><a href=\"https://api.tmsqd.co/auth/twitch\">Link your Twitch acount here.</a>", undefined, 60000);
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

            console.log("Unknown request");
            console.log(json);
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
    if (!x) return "";
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
                    pfp = DISCORD_AVATAR_URI + "embed/avatars/" + (account.discriminator % 5) + ".png";
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
                        <span class="account-stats"><span class="highlight">${streamer.twitchAccounts.length}</span> twitch account${streamer.twitchAccounts.length === 1 ? "" : "s"} • <span class="highlight">${streamer.discordAccounts.length}</span> discord account${streamer.discordAccounts.length === 1 ? "" : "s"} • Identity ID <span class="highlight">${streamer.id}</span></span>
                    </td>
                </tr>`;


                streamer.twitchAccounts.forEach(account => {
                    twitch += `
                    <tr class="account-row">
                        <td><img class="rounded-square-avatar" src="${account.profile_image_url}" alt="Profile picture for Twitch user '${account.display_name}'"></td>
                        <td>
                            <span class="account-name">${account.display_name}${account.affiliation === "partner" ? '&nbsp;<i class=\"fas fa-badge-check\"></i></span>' : ''}</span>
                            <span class="account-stats">${account.follower_count !== null ? `<span class="highlight">${comma(account.follower_count)}</span> follower${account.follower_count === 1 ? '' : 's'} • ` : ''}${account.view_count !== null ? `<span class="highlight">${comma(account.view_count)}</span> views • ` : ''}User ID <span class="highlight">${account.id}</span>${account.affiliation === null ? '' : (account.affiliation === "partner" ? " • <span class=\"highlight\">Partner <i class=\"far fa-badge-check\"></i></span>" : " • <span class=\"highlight\">Affiliate</span>")}</span>
                        </td>
                    </tr>`;
                });

                streamer.discordAccounts.forEach(account => {
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
            $(".bot-bot-status").html(moduleCode);
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
    let page = url;
    if (page.indexOf("//") !== -1) {
        page = page.slice(0, page.indexOf("//"));
    }
    page = page.replace("#/", '').replace("/", "-");

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

function loadDiv() {
    $(".search-form").removeClass("open");
    $("#search-results").fadeIn(300);
}

function loadIdentity(id, name) {
    window.location.hash = "/records/user//identity/" + id;

    api.get("identity/" + id, function (result) {
        if (result.success && result.data) {
            let identity = result.data;
            $("#search-results h3 small").html(`Display results for user identity ${identity.name} (${identity.id})`);
            $("#search-results .overview").html(`<img src="${identity.avatar_url}" alt="Profile picture for ${identity.name}" /><h4>${identity.name}</h4><span class="info"></span>`);
            loadDiv();
        } else {
            sendNotification("Failed to retrieve", "Failed to retrieve identity. Error: " + result.error + "<br/>Contact Twijn#8888 for assistance.", "notification-error");
        }
    });
}

function loadTwitchUser(id, name) {
    window.location.hash = "/records/user//twitch/" + id;

    loadDiv();
}

function loadDiscordUser(id, name) {
    window.location.hash = "/records/user//discord/" + id;

    loadDiv();
}

$(document).ready(function() {
    initWS();

    api.get("identity", function(data) {
        if (data.success) {
            emit("twitchAccountsChange", [data.data.twitchAccounts]);
            emit("discordAccountsChange", [data.data.discordAccounts]);
            if (data.data.discordAccounts.length > 0) {
                emit("profileImageChange", data.data.avatar_url);
            } else if (data.data.twitchAccounts.length > 0) {
                if (data.data.twitchAccounts[0].profile_image_url) {
                    emit("profileImageChange", data.data.twitchAccounts[0].profile_image_url);
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

    $(".add-twitch-profile").on("click", function() {
        if (confirm('Twitch will not prompt you to change your login account. Go to Twitch and verify this is the account you\'d like to add prior to continuing.\n\nIf your logged in account is the same account that you use to login here, you will just be sent back to this page.')) {
            window.location = "https://api.tmsqd.co/auth/twitch";
        }

        return false;
    });

    $("a.not-registered").on("click", function() {
        let ele = $(this);
        navigate(ele.attr("href"));
        return false;
    });

    $("a.not-registered").removeClass("not-registered");
    $("h1").on("click", function(){$("body").removeClass("menu-open");});
    $(".hamburger-menu").on("click", function(){$("body").toggleClass("menu-open");return false;});

    let originalMessage = $("#user-search-results").html();
    function updateSearch() {
        let query = encodeURIComponent($("#search-users").val());

        if (query === "") {
            $(".search-form").removeClass("open");
            $("#user-search-results").html(originalMessage);
            return false;
        }
        $(".search-form").addClass("open");

        api.get("search/" + query, function(data) {
            let identities = "";
            let twitchProfiles = "";
            let discordProfiles = "";

            data.identityResults.forEach(identity => {
                identities += `<div class="search-result" onclick="loadIdentity(${identity.id}, '${identity.name}')"><img src="${identity.avatar_url}" alt="404" /><span class="name">${identity.name}</span><span class="info"><strong>${identity.discordAccounts.length}</strong> discord account${identity.discordAccounts.length === 1 ? "" : "s"} • <strong>${identity.twitchAccounts.length}</strong> twitch account${identity.twitchAccounts.length === 1 ? "" : "s"}</span></div>`;
            });

            data.twitchAccountResults.forEach(twitchAccount => {
                let follower_count = comma(twitchAccount.follower_count);
                let view_count = comma(twitchAccount.view_count);
                if (follower_count === "") follower_count = "unknown";
                if (view_count === "") view_count = "unknown";
                let link;
                if (twitchAccount.identity?.id) {
                    link = `onclick="loadIdentity(${twitchAccount.identity.id}, '${twitchAccount.identity.name}')"`;
                } else {
                    link = `onclick="loadTwitchUser(${twitchAccount.id}, '${twitchAccount.display_name}')"`;
                }
                let affiliation = (twitchAccount.affiliation === "partner" ? " • <strong>Partner</strong> <i class=\"fas fa-badge-check\"></i>" : (twitchAccount.affiliation === "affiliate" ? " • <strong>Affiliate</strong>" : ""));
                twitchProfiles += `<div class="search-result" ${link}><img src="${twitchAccount.profile_image_url}" alt="404" /><span class="name">${twitchAccount.display_name}</span><span class="info"><strong>${follower_count}</strong> followers • <strong>${view_count}</strong> views • User ID <strong>${twitchAccount.id}</strong>${affiliation}</span></div>`;
            });

            data.discordAccountResults.forEach(discordAccount => {
                let link;
                if (discordAccount.identity?.id) {
                    link = `onclick="loadIdentity(${discordAccount.identity.id}, '${discordAccount.identity.name}')"`;
                } else {
                    link = `onclick="loadDiscordUser(${discordAccount.id}, '${discordAccount.name}')"`;
                }
                discordProfiles += `<div class="search-result" ${link}><img src="${discordAccount.avatar_url}" alt="404" /><span class="name">${discordAccount.name}</span><span class="info"><strong>${discordAccount.name}#${discordAccount.discriminator}</strong> • User ID <strong>${discordAccount.id}</strong></span></div>`;
            });

            if (identities !== "") {
                identities = "<strong>Identities</strong>" + identities;
            }
            if (twitchProfiles !== "") {
                twitchProfiles = "<strong>Twitch Profiles</strong>" + twitchProfiles;
            }
            if (discordProfiles !== "") {
                discordProfiles = "<strong>Discord Profiles</strong>" + discordProfiles;
            }

            $("#user-search-results").html(identities + twitchProfiles + discordProfiles);
        });

        return false;
    }

    let interval;

    $("#search-form").submit(updateSearch);
    $("#search-form").keyup(function() {
        if (interval) clearInterval(interval);
        interval = setTimeout(updateSearch, 500);
    });

    let pageDetermination = window.location.hash;
    if (pageDetermination.indexOf("//") !== -1)
        pageDetermination = pageDetermination.slice(0, pageDetermination.indexOf("//"));

    pageDetermination = pageDetermination.replace("#/", '').replace("/", "-");
    console.log(pageDetermination);

    if (pageDetermination === "" || $("." + pageDetermination).length === 0) {
        window.location.hash = "/you/linked-profiles";
    }

    navigate(window.location.hash);
});

window.onpopstate = function(event) {
    if (event.state && event.state.page && event.state.url) {
        navigate(event.state.url);
    }
};
