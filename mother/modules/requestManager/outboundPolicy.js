'use strict';

const dns = require('dns').promises;
const https = require('https');
const { BlockList, isIPv4 } = require('net');
const blocked = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 3]
]) blocked.addSubnet(address, prefix);

function assertPublicAddress(address) {
  // IPv6 is deliberately unavailable until an equally narrow policy is supported.
  if (!isIPv4(address) || blocked.check(address)) throw new Error('[E_REQUEST_ADDRESS_DENIED] Outbound address is not public IPv4.');
}

async function pinnedAgent(hostname) {
  const addresses = await dns.lookup(hostname, { family: 4, all: true });
  if (!addresses.length) throw new Error('[E_REQUEST_DNS_EMPTY] No outbound address found.');
  for (const { address } of addresses) assertPublicAddress(address);
  // Pin the checked address at connect time: validating DNS then resolving again is unsafe.
  const address = addresses[0].address;
  return new https.Agent({ lookup: (_host, options, callback) => options.all
    ? callback(null, [{ address, family: 4 }]) : callback(null, address, 4) });
}

module.exports = { assertPublicAddress, pinnedAgent };
