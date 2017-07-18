import View from 'girder/views/View';
import router from 'girder/router';

import PaginateTasksWidget from './PaginateTasksWidget';

var TaskListView = View.extend({
    initialize: function () {
        this.paginateWidget = new PaginateTasksWidget({
            el: this.$el,
            parentView: this,
            hyperlinkCallback: function (task) {
                return `#item_task/${task.id}/run`;
            },
            fetchParams: {
                limit: 2
            }
        }).once('g:selected', function (params) {
            const taskId = params.taskId;
            router.navigate(`item_task/${taskId}/run`, {trigger: true});
        });
    }
});

export default TaskListView;
