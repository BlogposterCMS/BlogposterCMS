const dns = require('dns').promises;
const { assertPublicAddress, pinnedAgent } = require('../mother/modules/requestManager/outboundPolicy');
const { _internals } = require('../mother/modules/requestManager');

test.each(['127.0.0.1','169.254.169.254','10.1.2.3','100.100.100.200','192.168.1.1','172.16.0.1','::1','::ffff:127.0.0.1'])('outbound policy blocks private/metadata address %s', address => {
  expect(() => assertPublicAddress(address)).toThrow('E_REQUEST_ADDRESS_DENIED');
});
test('checked DNS address is pinned and mixed private answers are rejected', async () => {
  const lookup = jest.spyOn(dns,'lookup').mockResolvedValue([{address:'93.184.216.34',family:4}]);
  try {
    const agent = await pinnedAgent('example.test');
    lookup.mockResolvedValue([{address:'127.0.0.1',family:4}]);
    const callback = jest.fn(); agent.options.lookup('example.test',{},callback);
    expect(callback).toHaveBeenCalledWith(null,'93.184.216.34',4);
    agent.destroy();
    await expect(pinnedAgent('example.test')).rejects.toThrow('E_REQUEST_ADDRESS_DENIED');
  } finally { lookup.mockRestore(); }
});
test('missing allowlist, credentials and HTTP fail closed', () => {
  const previous = process.env.REQUEST_MANAGER_ALLOWED_HOSTS;
  try {
    delete process.env.REQUEST_MANAGER_ALLOWED_HOSTS;
    expect(() => _internals.assertAllowedRequestUrl('https://example.test')).toThrow('E_REQUEST_HOSTS_UNCONFIGURED');
    process.env.REQUEST_MANAGER_ALLOWED_HOSTS = 'example.test';
    for (const url of ['http://example.test','https://user:pass@example.test','https://example.test:8443']) expect(() => _internals.assertAllowedRequestUrl(url)).toThrow('E_REQUEST_URL_DENIED');
  } finally { if (previous === undefined) delete process.env.REQUEST_MANAGER_ALLOWED_HOSTS; else process.env.REQUEST_MANAGER_ALLOWED_HOSTS = previous; }
});
