const { WebPubSubServiceClient } = require('@azure/web-pubsub');

module.exports = async function (context, req) {
	const room = req.query.room || 'default';
	const user = req.query.user || 'anon';

	const connection_string = process.env.WEBPUBSUB_CONNECTION_STRING;
	if (!connection_string) {
		context.res = { status: 500, body: { error: 'WebPubSub not configured' } };
		return;
	}

	try {
		const client = new WebPubSubServiceClient(connection_string, 'whiteboard');
		const token = await client.getClientAccessToken({
			userId: user,
			roles: [
				`webpubsub.joinLeaveGroup.${room}`,
				`webpubsub.sendToGroup.${room}`,
			],
		});

		context.res = {
			status: 200,
			headers: { 'Content-Type': 'application/json' },
			body: { url: token.url },
		};
	} catch (err) {
		context.log.error('Negotiate error:', err);
		context.res = { status: 500, body: { error: 'Failed to negotiate' } };
	}
};
