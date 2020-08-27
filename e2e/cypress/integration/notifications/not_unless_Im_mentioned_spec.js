// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// ***************************************************************
// - [#] indicates a test step (e.g. # Go to a page)
// - [*] indicates an assertion (e.g. * Check the title)
// - Use element ID when selecting an element. Create one if none.
// ***************************************************************

// Stage: @prod
// Group: @notifications

function setReplyNotificationsSetting(idToToggle) {
    // Navigate to settings modal
    cy.toAccountSettingsModal();

    // Select "Notifications"
    cy.get('#notificationsButton').click();

    // Notifications header should be visible
    cy.get('#notificationSettingsTitle').
        scrollIntoView().
        should('be.visible').
        and('contain', 'Notifications');

    // Open up 'Reply Notifications' sub-section
    cy.get('#commentsTitle').
        scrollIntoView().
        click();

    cy.get(idToToggle).check().should('be.checked');

    // Click “Save” and close modal
    cy.get('#saveSetting').
        scrollIntoView().
        click();
    cy.get('#accountSettingsHeader > .close').
        click().
        should('not.exist');

    // Setup notification spy
    cy.window().then((win) => {
        function Notification(title, opts) {
            this.title = title;
            this.opts = opts;
        }

        Notification.requestPermission = function() {
            return 'granted';
        };

        Notification.close = function() {
            return true;
        };

        win.Notification = Notification;

        cy.spy(win, 'Notification').as('notifySpy');
    });

    // Verify that we now have a Notification property
    cy.window().should('have.property', 'Notification');
}

describe('reply-notifications', () => {
    function ignoreUncaughtException() {
        cy.on('uncaught:exception', (err) => {
            expect(err.message).to.include('.close is not a function');

            return false;
        });
    }

    let testTeam;
    let otherChannel;
    let townsquareChannelId;
    let receiver;
    let sender;

    before(() => {
        // # Update Configs
        cy.apiUpdateConfig({
            ServiceSettings: {
                ExperimentalChannelOrganization: true,
            },
        });

        cy.apiInitSetup().then(({team, channel, user}) => {
            testTeam = team;
            otherChannel = channel;
            receiver = user;

            cy.apiCreateUser().then(({user: user1}) => {
                sender = user1;

                cy.apiAddUserToTeam(testTeam.id, sender.id);
            });

            cy.apiGetChannelByName(testTeam.name, 'town-square').then((res) => {
                townsquareChannelId = res.body.id;
            });

            // # Login as receiver and visit town-square channel
            cy.apiLogin(receiver);
            cy.visit(`/${testTeam.name}/channels/town-square`);
        });
    });

    it('MM-T551 not unless I\'m mentioned', () => {
        ignoreUncaughtException();

        // # Set users notification settings
        setReplyNotificationsSetting('#notificationCommentsNever');

        // # Navigate to town square channel
        cy.get(`#sidebarItem_${'town-square'}`).click({force: true});

        // # Post a message
        cy.postMessage('Hi there, this is a root message');

        // # Get post id of message
        cy.getLastPostId().then((postId) => {
            // # Switch to other channel so that unread notifications in 'town-square` may be triggered
            cy.get(`#sidebarItem_${otherChannel.name}`).click({force: true});

            // # Post a message in original thread as another user
            cy.postMessageAs({sender, message: 'This is a reply to the root post', channelId: townsquareChannelId, rootId: postId});
        });

        // * Verify stub was not called
        cy.get('@notifySpy').should('be.not.called');

        // * Verify unread mentions badge does not exist
        cy.get('#publicChannel');
        cy.get('#sidebarItem_town-square').
            find('#unreadMentions').
            should('be.not.visible');
    });
});
