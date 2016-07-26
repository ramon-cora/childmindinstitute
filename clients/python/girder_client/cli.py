#!/usr/bin/env python
# -*- coding: utf-8 -*-

###############################################################################
#  Copyright Kitware Inc.
#
#  Licensed under the Apache License, Version 2.0 ( the "License" );
#  you may not use this file except in compliance with the License.
#  You may obtain a copy of the License at
#
#    http://www.apache.org/licenses/LICENSE-2.0
#
#  Unless required by applicable law or agreed to in writing, software
#  distributed under the License is distributed on an "AS IS" BASIS,
#  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#  See the License for the specific language governing permissions and
#  limitations under the License.
###############################################################################

import argparse
from six import add_metaclass, string_types
from girder_client import GirderClient


class GirderCli(GirderClient):
    """
    A command line Python client for interacting with a Girder instance's
    RESTful api, specifically for performing uploads into a Girder instance.
    """

    def __init__(self, username, password, host=None, port=None, apiRoot=None,
                 scheme=None, apiUrl=None, apiKey=None):
        """
        Initialization function to create a GirderCli instance, will attempt
        to authenticate with the designated Girder instance. Aside from username, password,
        and apiKey, all other kwargs are passed directly through to the
        :py:class:`girder_client.GirderClient` base class constructor.

        :param username: username to authenticate to Girder instance.
        :param password: password to authenticate to Girder instance, leave
            this blank to be prompted.
        """
        super(GirderCli, self).__init__(
            host=host, port=port, apiRoot=apiRoot, scheme=scheme, apiUrl=apiUrl)
        interactive = password is None

        if apiKey:
            self.authenticate(apiKey=apiKey)
        elif username:
            self.authenticate(username, password, interactive=interactive)


parser = argparse.ArgumentParser(
    prog='girder-cli', description='Perform common Girder CLI operations.')
parser.add_argument('--username', required=False, default=None)
parser.add_argument('--password', required=False, default=None)
parser.add_argument('--api-key', required=False, default=None)
parser.add_argument('--api-url', required=False, default=None,
                    help='full URL to the RESTful API of a Girder server')
parser.add_argument('--scheme', required=False, default=None)
parser.add_argument('--host', required=False, default=None)
parser.add_argument('--port', required=False, default=None)
parser.add_argument('--api-root', required=False, default=None,
                    help='relative path to the Girder REST API')

subparsers = parser.add_subparsers(
    title='subcommands', dest='subcommand', description='Valid subcommands')
subparsers.required = True

_COMMON_OPTIONS = dict(
    reuse=dict(
        longname='--reuse', action='store_true',
        help='use existing items of same name at same location or create a new one'),
    leaf_folders_as_items=dict(
        longname='--leaf-folders-as-items', required=False, action='store_true',
        help='upload all files in leaf folders to a single Item named after the folder'),
    parent_type=dict(
        longname='--parent-type', required=False, default='folder',
        help='type of Girder parent target, one of (collection, folder, user)'),
    blacklist=dict(
        longname='--blacklist', required=False, default='',
        help='comma-separated list of filenames to ignore'),
    dryrun=dict(
        longname='--dryrun', required=False, action='store_true',
        help='will not write anything to Girder, only report what would happen'
    ),
    parent_id=dict(short='parent_id', help='id of Girder parent target'),
    local_folder=dict(short='local_folder', help='path to local target folder')
)


class GirderCommandSubtype(type):
    def __init__(self, name, *args, **kwargs):
        super(GirderCommandSubtype, self).__init__(name, *args, **kwargs)
        if self.name:
            sc = subparsers.add_parser(
                self.name, description=self.description, help=self.description)
            sc.set_defaults(func=self.run)
            for arg in self.args:
                if isinstance(arg, string_types):
                    arg = _COMMON_OPTIONS[arg].copy()
                argc = dict(arg.items())
                argnames = []
                if 'short' in argc:
                    argnames.append(argc.pop('short'))
                if 'longname' in argc:
                    argnames.append(argc.pop('longname'))
                sc.add_argument(*argnames, **argc)


@add_metaclass(GirderCommandSubtype)
class GirderCommand(object):
    args = ()
    name = None
    description = ''
    gc = None

    @classmethod
    def run(cls, args):
        self = cls()
        self(args)

    def _setClient(self, args):
        self.gc = GirderCli(
            args.username, args.password, host=args.host, port=args.port, apiRoot=args.api_root,
            scheme=args.scheme, apiUrl=args.api_url, apiKey=args.api_key)


class GirderUploadCommand(GirderCommand):
    name = 'upload'
    description = 'Upload files to Girder'
    args = ('reuse', 'leaf_folders_as_items', 'blacklist', 'dryrun',
            'parent_type', 'parent_id', 'local_folder')

    def __call__(self, args):
        self._setClient(args)
        self.gc.upload(
            args.local_folder, args.parent_id, args.parent_type,
            leafFoldersAsItems=args.leaf_folders_as_items, reuseExisting=args.reuse,
            blacklist=args.blacklist.split(','), dryrun=args.dryrun)


class GirderDownloadCommand(GirderCommand):
    name = 'download'
    description = 'Download files from Girder'
    args = ('parent_type', 'parent_id', 'local_folder')

    def __call__(self, args):
        if args.parent_type != 'folder':
            raise Exception('download command only accepts parent-type of folder')

        self._setClient(args)
        self.gc.downloadFolderRecursive(args.parent_id, args.local_folder)


class GirderLocalsyncCommand(GirderCommand):
    name = 'localsync'
    description = 'Synchronize local folder with remote Girder folder'
    args = ('parent_type', 'parent_id', 'local_folder')

    def __call__(self, args):
        if args.parent_type != 'folder':
            raise Exception('localsync command only accepts parent-type of folder')

        self._setClient(args)
        self.gc.loadLocalMetadata(args.local_folder)
        self.gc.downloadFolderRecursive(args.parent_id, args.local_folder, sync=True)
        self.gc.saveLocalMetadata(args.local_folder)


def main():
    args = parser.parse_args()
    args.func(args)


if __name__ == '__main__':
    main()  # pragma: no cover
