import $ from 'jquery';

import CollectionModel from 'girder/models/CollectionModel';
import View from 'girder/views/View';
import MarkdownWidget from 'girder/views/widgets/MarkdownWidget';
import { handleClose, handleOpen } from 'girder/dialog';

import EditCollectionWidgetTemplate from 'girder/templates/widgets/editCollectionWidget.pug';

import 'girder/utilities/jquery/girderEnable';
import 'girder/utilities/jquery/girderModal';

/**
 * This widget is used to create a new collection or edit an existing one.
 */
var EditCollectionWidget = View.extend({
    events: {
        'submit #g-collection-edit-form': function (e) {
            e.preventDefault();

            var fields = {
                name: this.$('#g-name').val(),
                description: this.descriptionEditor.val()
            };

            if (this.model) {
                this.updateCollection(fields);
            } else {
                this.createCollection(fields);
            }

            this.descriptionEditor.saveText();
            this.$('button.g-save-collection').girderEnable(false);
            this.$('.g-validation-failed-message').text('');
        }
    },

    initialize: function (settings) {
        this.model = settings.model || null;
        this.descriptionEditor = new MarkdownWidget({
            text: this.model ? this.model.get('description') : '',
            prefix: 'collection-description',
            placeholder: 'Enter a description',
            enableUploads: false,
            parentView: this
        });
    },

    render: function () {
        var modal = this.$el.html(EditCollectionWidgetTemplate({
            collection: this.model
        })).girderModal(this).on('shown.bs.modal', () => {
            this.$('#g-name').focus();
        }).on('hidden.bs.modal', () => {
            if (this.create) {
                handleClose('create');
            } else {
                handleClose('edit');
            }
        }).on('ready.girder.modal', () => {
            if (this.model) {
                this.$('#g-name').val(this.model.get('name'));
                this.$('#g-description').val(this.model.get('description'));
                this.create = false;
            } else {
                this.create = true;
            }
        });
        modal.trigger($.Event('ready.girder.modal', {relatedTarget: modal}));
        this.descriptionEditor.setElement(this.$('.g-description-editor-container')).render();
        this.$('#g-name').focus();

        if (this.model) {
            handleOpen('edit');
        } else {
            handleOpen('create');
        }

        return this;
    },

    createCollection: function (fields) {
        var collection = new CollectionModel();
        collection.set(fields);
        collection.on('g:saved', function () {
            this.$el.modal('hide');
            this.trigger('g:saved', collection);
        }, this).off('g:error').on('g:error', function (err) {
            this.$('.g-validation-failed-message').text(err.responseJSON.message);
            this.$('button.g-save-collection').girderEnable(true);
            this.$('#g-' + err.responseJSON.field).focus();
        }, this).save();
    },

    updateCollection: function (fields) {
        this.model.set(fields);
        this.model.on('g:saved', function () {
            this.$el.modal('hide');
            this.trigger('g:saved', this.model);
        }, this).off('g:error').on('g:error', function (err) {
            this.$('.g-validation-failed-message').text(err.responseJSON.message);
            this.$('button.g-save-collection').girderEnable(true);
            this.$('#g-' + err.responseJSON.field).focus();
        }, this).save();
    }
});

export default EditCollectionWidget;
