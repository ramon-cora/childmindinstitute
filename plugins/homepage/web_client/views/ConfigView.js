import _ from 'underscore';

import FolderModel from 'girder/models/FolderModel';
import MarkdownWidget from 'girder/views/widgets/MarkdownWidget';
import PluginConfigBreadcrumbWidget from 'girder/views/widgets/PluginConfigBreadcrumbWidget';
import View from 'girder/views/View';
import events from 'girder/events';
import { restRequest } from 'girder/rest';

import ConfigViewTemplate from '../templates/configView.pug';
import '../stylesheets/configView.styl';

var ConfigView = View.extend({
    events: {
        'submit #g-homepage-form': function (event) {
            event.preventDefault();
            this._saveSettings([{
                key: 'homepage.markdown',
                value: this.editor.val()
            },
            {
                key: 'homepage.header',
                value: this.$('#g-homepage-header').val()
            },
            {
                key: 'homepage.subheading_text',
                value: this.$('#g-homepage-subheading-text').val()
            },
            {
                key: 'homepage.welcome_text',
                value: this.$('#g-homepage-welcome-text').val()
            }]);
        }
    },

    initialize: function () {
        restRequest({
            method: 'GET',
            url: 'homepage/markdown'
        }).done(_.bind(function (resp) {
            this.folder = new FolderModel({_id: resp.folderId});
            this.editor = new MarkdownWidget({
                prefix: 'homepage',
                placeholder: 'Enter Markdown for the homepage',
                parentView: this,
                parent: this.folder,
                enableUploads: true,
                maxUploadSize: 1024 * 1024 * 10,
                allowedExtensions: ['png', 'jpeg', 'jpg', 'gif']
            });
            this.render();
            this.editor.val(resp['homepage.markdown']);
        }, this));

        restRequest({
            method: 'GET',
            url: 'homepage/settings'
        }).done(_.bind(function (resp) {
            this.folder = new FolderModel({_id: resp.folderId});
            this.header = resp['homepage.header'];
            this.subHeadingText = resp['homepage.subheading_text'];
            this.welcomeText = resp['homepage.welcome_text'];
            this.render();
        }, this));
    },

    render: function () {
        this.$el.html(ConfigViewTemplate({
            header: this.header || null,
            subHeadingText: this.subHeadingText || null,
            welcomeText: this.welcomeText || null,
            defaultHeader: 'Girder',
            defaultWelcomeText: 'Welcome to Girder!',
            defaultSubHeadingText: 'Data management platform'
        }));

        this.editor.setElement(
            this.$('.g-homepage-container')).render();

        if (!this.breadcrumb) {
            this.breadcrumb = new PluginConfigBreadcrumbWidget({
                pluginName: 'Homepage',
                el: this.$('.g-config-breadcrumb-container'),
                parentView: this
            }).render();
        }

        return this;
    },

    _saveSettings: function (settings) {
        restRequest({
            method: 'PUT',
            url: 'system/setting',
            data: {
                list: JSON.stringify(settings)
            },
            error: null
        }).done(_.bind(function () {
            events.trigger('g:alert', {
                icon: 'ok',
                text: 'Settings saved.',
                type: 'success',
                timeout: 4000
            });
        }, this)).fail(_.bind(function (resp) {
            this.$('#g-homepage-error-message').text(
                resp.responseJSON.message
            );
        }, this));
    }
});

export default ConfigView;
