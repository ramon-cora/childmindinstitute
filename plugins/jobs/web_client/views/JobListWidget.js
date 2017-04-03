import _ from 'underscore';
import vg from 'vega';
import moment from 'moment';

import PaginateWidget from 'girder/views/widgets/PaginateWidget';
import View from 'girder/views/View';
import router from 'girder/router';
import { restRequest } from 'girder/rest';
import { defineFlags, formatDate, DATE_SECOND } from 'girder/misc';
import eventStream from 'girder/utilities/EventStream';
import { getCurrentUser } from 'girder/auth';
import { SORT_DESC } from 'girder/constants';

import JobCollection from '../collections/JobCollection';
import JobListWidgetTemplate from '../templates/jobListWidget.pug';
import JobListTemplate from '../templates/JobList.pug';
import JobsGraphWidgetTemplate from '../templates/JobsGraphWidget.pug';
import JobStatus from '../JobStatus';
import JobStatusSegmentizer from './JobStatusSegmentizer';
import CheckBoxMenu from './CheckBoxMenu';
import phaseChartConfig from './phaseChartConfig';
import timeChartConfig from './timeChartConfig';

import '../stylesheets/jobListWidget.styl';

var JobListWidget = View.extend({
    events: {
        'click .g-job-trigger-link': function (e) {
            var cid = $(e.target).attr('cid');
            this.trigger('g:jobClicked', this.collection.get(cid));
        },
        'change select.g-page-size': function (e) {
            this.collection.pageLimit = parseInt($(e.target).val());
            this.pageSize = this.collection.pageLimit;
            this.collection.fetch({}, true);
        }
    },

    initialize: function (settings) {
        var currentUser = getCurrentUser();
        this.showAllJobs = !!settings.allJobsMode;
        this.columns = settings.columns || this.columnEnum.COLUMN_ALL;
        this.userId = (settings.filter && !settings.allJobsMode) ? (settings.filter.userId ? settings.filter.userId : currentUser.id) : null;
        this.typeFilter = null;
        this.statusFilter = null;
        this.phasesFilter = JobStatus.getAllStatus().reduce((obj, status) => {
            obj[status.text] = true;
            return obj;
        }, {});

        this.pageSizes = [25, 50, 100, 250, 500, 1000];
        this.pageSize = 25;

        this.collection = new JobCollection();
        if (this.showAllJobs) {
            this.collection.resourceName = 'job/all';
        }
        this.collection.sortField = settings.sortField || 'created';
        this.collection.sortDir = settings.sortDir || SORT_DESC;
        this.collection.pageLimit = settings.pageLimit || this.collection.pageLimit;

        this.collection.on('g:changed', function () {
            this.render();
        }, this);
        this._fetchWithFilter();

        this.currentView = settings.view ? settings.view : 'list';
        this.yScale = 'sqrt';

        this.showHeader = _.has(settings, 'showHeader') ? settings.showHeader : true;
        this.showPaging = _.has(settings, 'showPaging') ? settings.showPaging : true;
        this.linkToJob = _.has(settings, 'linkToJob') ? settings.linkToJob : true;
        this.triggerJobClick = _.has(settings, 'triggerJobClick') ? settings.triggerJobClick : false;

        this.paginateWidget = new PaginateWidget({
            collection: this.collection,
            parentView: this
        });

        eventStream.on('g:event.job_status', this._statusChange, this);

        this.typeFilterWidget = new CheckBoxMenu({
            title: 'Type',
            values: [],
            parentView: this
        });

        this.typeFilterWidget.on('g:triggerCheckBoxMenuChanged', function (e) {
            this.typeFilter = _.keys(e).reduce((arr, key) => {
                if (e[key]) {
                    arr.push(key);
                }
                return arr;
            }, []);
            this._fetchWithFilter();
        }, this);

        this.statusFilterWidget = new CheckBoxMenu({
            title: 'Status',
            values: [],
            parentView: this
        });

        let statusTextToStatusCode = {};
        this.statusFilterWidget.on('g:triggerCheckBoxMenuChanged', function (e) {
            this.statusFilter = _.keys(e).reduce((arr, key) => {
                if (e[key]) {
                    arr.push(parseInt(statusTextToStatusCode[key]));
                }
                return arr;
            }, []);
            this._fetchWithFilter();
        }, this);

        restRequest({
            path: this.showAllJobs ? 'job/meta/all' : 'job/meta',
            method: 'GET'
        }).done(result => {
            var typesFilter = result.types.reduce((obj, type) => {
                obj[type] = true;
                return obj;
            }, {});
            this.typeFilterWidget.setValues(typesFilter);

            var statusFilter = result.statuses.map(status => {
                let statusText = JobStatus.text(status);
                statusTextToStatusCode[statusText] = status;
                return statusText;
            }).reduce((obj, statusText) => {
                obj[statusText] = true;
                return obj;
            }, {});
            this.statusFilterWidget.setValues(statusFilter);
        });

        this.phaseFilterWidget = new CheckBoxMenu({
            title: 'Phases',
            values: [],
            parentView: this
        });

        this.phaseFilterWidget.on('g:triggerCheckBoxMenuChanged', function (e) {
            this.phasesFilter = _.extend(this.phasesFilter, e);
            this.render();
        }, this);
    },

    columnEnum: defineFlags([
        'COLUMN_STATUS_ICON',
        'COLUMN_TITLE',
        'COLUMN_UPDATED',
        'COLUMN_OWNER',
        'COLUMN_TYPE',
        'COLUMN_STATUS'
    ], 'COLUMN_ALL'),

    render: function () {
        var jobs = this.collection.toArray();

        this.$el.html(JobListTemplate(this));

        this.typeFilterWidget.setElement(this.$('.filter-container .type')).render();
        this.statusFilterWidget.setElement(this.$('.filter-container .status')).render();

        this.$('a[data-toggle="tab"]').on('shown.bs.tab', e => {
            this.currentView = $(e.target).attr('name');
            if (this.userId) {
                router.navigate(`jobs/user/${this.userId}/${this.currentView}`);
            } else {
                router.navigate(`jobs/${this.currentView}`);
            }
            this.render();
        });

        if (!jobs.length) {
            this.$('.g-main-content').text('no record found');
            return this;
        }

        if (this.currentView === 'list') {
            this.$('.g-main-content').html(JobListWidgetTemplate({
                jobs: jobs,
                showHeader: this.showHeader,
                columns: this.columns,
                columnEnum: this.columnEnum,
                linkToJob: this.linkToJob,
                triggerJobClick: this.triggerJobClick,
                JobStatus: JobStatus,
                formatDate: formatDate,
                DATE_SECOND: DATE_SECOND
            }));
        }

        var changeScaleType = view => {
            return (event, item) => {
                if (item && item.itemName && item.itemName === 'ylabel') {
                    view.destroy(); this.yScale = this.yScale === 'sqrt' ? 'linear' : 'sqrt'; this.render();
                }
            };
        };

        if (this.currentView === 'phase') {
            this.$('.g-main-content').html(JobsGraphWidgetTemplate());

            new JobStatusSegmentizer().segmentize(jobs);
            let vegaData = this._prepareDataForChart(jobs);

            let config = jQuery.extend(true, {}, phaseChartConfig);
            config.width = Math.min(Math.max(this.$el.width() - 50, jobs.length * 16 + 100), jobs.length * 30 + 400);
            config.height = $(window).height() - 180;
            this.$('.g-jobs-graph').height($(window).height() - 160);
            config.data[0].values = vegaData;
            config.scales[1].type = this.yScale;
            let allStatus = JobStatus.getAllStatus().filter(status => this.phasesFilter ? this.phasesFilter[status.text] : true);
            config.scales[2].domain = allStatus.map(status => status.text);
            config.scales[2].range = allStatus.map(status => status.color);
            config.scales[3].domain = jobs.map(job => job.get('_id'));
            config.scales[3].range = jobs.map(job => job.get('title'));

            vg.parse.spec(config, chart => {
                var view = chart({
                    el: this.$('.g-jobs-graph').get(0),
                    renderer: 'svg'
                }).update();

                view.on('click', changeScaleType(view));
            });

            this.phaseFilterWidget.setValues(this.phasesFilter);
            this.phaseFilterWidget.setElement(this.$('.graph-filter-container .phase')).render();
        }

        if (this.currentView === 'time') {
            this.$('.g-main-content').html(JobsGraphWidgetTemplate());

            new JobStatusSegmentizer().segmentize(jobs);
            let vegaData = this._prepareDataForChart(jobs);
            let config = jQuery.extend(true, {}, timeChartConfig);
            config.width = Math.min(Math.max(this.$el.width() - 50, jobs.length * 16 + 100), jobs.length * 30 + 400);
            config.height = $(window).height() - 180;
            this.$('.g-jobs-graph').height($(window).height() - 160);
            config.data[0].values = vegaData;
            config.scales[1].type = this.yScale;
            config.scales[2].domain = jobs.map(job => job.get('_id'));
            config.scales[2].range = jobs.map(job => {
                let datetime = moment(job.get('updated')).format('MM/DD');
                return datetime;
            });
            config.scales[3].domain = jobs.map(job => job.get('_id'));
            config.scales[3].range = jobs.map(job => job.get('title'));
            let allStatus = JobStatus.getAllStatus().filter(status => {
                if (status.text !== 'Inactive' && status.text !== 'Queued') {
                    if (this.phasesFilter) {
                        return this.phasesFilter[status.text];
                    }
                    return false;
                }
                return false;
            });
            config.scales[4].domain = allStatus.map(status => status.text);
            config.scales[4].range = allStatus.map(status => status.color);

            vg.parse.spec(config, chart => {
                var view = chart({
                    el: this.$('.g-jobs-graph').get(0),
                    renderer: 'svg'
                }).update();

                view.on('click', changeScaleType(view));
            });

            let positivePhases = _.clone(this.phasesFilter);
            delete positivePhases['Inactive'];
            delete positivePhases['Queued'];
            this.phaseFilterWidget.setValues(positivePhases);
            this.phaseFilterWidget.setElement(this.$('.graph-filter-container').children().eq(0)).render();
        }

        if (this.showPaging) {
            this.paginateWidget.setElement(this.$('.g-job-pagination')).render();
        }

        return this;
    },

    _statusChange: function (event) {
        let jobModel = _.find(this.collection.toArray(), job => job.get('_id') === event.data._id);
        if (jobModel) {
            jobModel.set(event.data);
        }
        if (this.currentView === 'list') {
            var job = event.data,
                tr = this.$('tr[g-job-id=' + job._id + ']');

            if (!tr.length) {
                return;
            }

            if (this.columns & this.columnEnum.COLUMN_STATUS_ICON) {
                tr.find('td.g-status-icon-container').attr('status', job.status)
                    .find('i').removeClass().addClass(JobStatus.icon(job.status));
            }
            if (this.columns & this.columnEnum.COLUMN_STATUS) {
                tr.find('td.g-job-status-cell').text(JobStatus.text(job.status));
            }
            if (this.columns & this.columnEnum.COLUMN_UPDATED) {
                tr.find('td.g-job-updated-cell').text(
                    formatDate(job.updated, DATE_SECOND));
            }

            tr.addClass('g-highlight');

            window.setTimeout(function () {
                tr.removeClass('g-highlight');
            }, 1000);
        } else {
            this.render();
        }
    },

    _prepareDataForChart(jobs) {
        let allRecords = [];
        jobs.forEach(job => {
            let id = job.get('_id');
            let title = job.get('title');
            let currentStatus = JobStatus.text(job.get('status'));
            let updated = moment(job.get('updated')).format('L LT');
            let records = job.get('segments')
                .map(segment => {
                    let status = segment.status;
                    let elapsed = '';
                    switch (status) {
                        case 'Inactive':
                            elapsed = -segment.elapsed;
                            break;
                        case 'Queued':
                            elapsed = -segment.elapsed;
                            break;
                        default:
                            elapsed = segment.elapsed;
                    }
                    return {
                        id: id,
                        title: title,
                        updated: updated,
                        status: status,
                        currentStatus: currentStatus,
                        elapsed: elapsed
                    };
                })
                .filter(record => this.phasesFilter[record.status]);
            if (records.length) {
                allRecords = allRecords.concat(records);
            } else {
                allRecords.push({
                    id: id,
                    title: title,
                    updated: updated,
                    currentStatus: currentStatus
                });
            }
        });
        return allRecords;
    },

    _fetchWithFilter() {
        var filter = {};
        if (this.userId) {
            filter.userId = this.userId;
        }
        if (this.typeFilter) {
            filter.types = JSON.stringify(this.typeFilter);
        }
        if (this.statusFilter) {
            filter.statuses = JSON.stringify(this.statusFilter);
        }
        this.collection.params = filter;
        this.collection.fetch({}, true);
    }
});

export default JobListWidget;
