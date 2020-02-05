import { getJIRAClient } from '../src/utils';

describe('TODO - Add a test suite', () => {
  const client = getJIRAClient('https://cleartaxtech.atlassian.net/', '<token_here>');

  it('should be able to access the issue', async () => {
    const details = await client.getTicketDetails('ES-10');
    console.log({ details });
    expect(details).not.toBeNull();
  });

});

