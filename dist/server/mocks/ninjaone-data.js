"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mockCustomers = void 0;
exports.mockCustomers = [
    {
        id: 1,
        name: 'Mustermann GmbH',
        devices: [
            { id: 101, name: 'NAS-01', product: 'synology-dsm', currentVersion: '7.1.1' },
            { id: 102, name: 'FW-01', product: 'sophos-firewall', currentVersion: '19.5.3' },
            { id: 103, name: 'UNIFI-01', product: 'unifi-network', currentVersion: '7.5.187' },
            { id: 104, name: 'TV-01', product: 'teamviewer', currentVersion: '15.51.6' },
        ],
    },
    {
        id: 2,
        name: 'TechStart AG',
        devices: [
            { id: 201, name: 'PVE-01', product: 'proxmox-ve', currentVersion: '8.0.4' },
            { id: 202, name: 'PBS-01', product: 'proxmox-backup', currentVersion: '3.0.2' },
            { id: 203, name: 'NAS-02', product: 'synology-dsm', currentVersion: '7.2.0' },
        ],
    },
    {
        id: 3,
        name: 'Kanzlei Weber',
        devices: [
            { id: 301, name: 'FW-02', product: 'sophos-firewall', currentVersion: '19.0.1' },
            { id: 302, name: 'UNIFI-02', product: 'unifi-network', currentVersion: '7.4.162' },
            { id: 303, name: 'TV-02', product: 'teamviewer', currentVersion: '15.70.3' },
        ],
    },
    {
        id: 4,
        name: 'Praxis Dr. Schmidt',
        devices: [
            { id: 401, name: 'NAS-03', product: 'synology-dsm', currentVersion: '7.0.1' },
            { id: 402, name: 'PVE-02', product: 'proxmox-ve', currentVersion: '7.4.3' },
            { id: 403, name: 'TV-03', product: 'teamviewer', currentVersion: '15.74.6' },
        ],
    },
];
