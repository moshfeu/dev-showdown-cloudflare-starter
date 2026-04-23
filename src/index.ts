import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateObject, generateText, tool } from 'ai';
import { z } from 'zod';

const INTERACTION_ID_HEADER = 'X-Interaction-Id';

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		if (request.method === 'GET' && url.pathname === '/') {
			const runningMessage = 'Dev Showdown Cloudflare Starter is running.';
			const message = env.DEV_SHOWDOWN_API_KEY
				? runningMessage
				: [runningMessage, 'DEV_SHOWDOWN_API_KEY is missing.'].join(
						'\n',
					);

			return new Response(message, {
				headers: {
					'Content-Type': 'text/plain; charset=utf-8',
				},
			});
		}

		if (request.method !== 'POST' || url.pathname !== '/api') {
			return new Response('Not Found', { status: 404 });
		}

		const challengeType = url.searchParams.get('challengeType');
		if (!challengeType) {
			return new Response('Missing challengeType query parameter', {
				status: 400,
			});
		}

		const interactionId = request.headers.get(INTERACTION_ID_HEADER);
		if (!interactionId) {
			return new Response(`Missing ${INTERACTION_ID_HEADER} header`, {
				status: 400,
			});
		}

		const payload = await request.json<any>();

		switch (challengeType) {
			case 'HELLO_WORLD':
				return Response.json({
					greeting: `Hello ${payload.name}`,
				});
			case 'BASIC_LLM': {
				if (!env.DEV_SHOWDOWN_API_KEY) {
					throw new Error('DEV_SHOWDOWN_API_KEY is required');
				}

				const workshopLlm = createWorkshopLlm(env.DEV_SHOWDOWN_API_KEY, interactionId);
				const result = await generateText({
					model: workshopLlm.chatModel('deli-4'),
					system: 'You are a trivia question player. Answer the question correctly and concisely.',
					prompt: payload.question,
				});

				return Response.json({
					answer: result.text || 'N/A',
				});
			}
				case 'JSON_MODE': {
				if (!env.DEV_SHOWDOWN_API_KEY) {
					throw new Error('DEV_SHOWDOWN_API_KEY is required');
				}

				const workshopLlm = createWorkshopLlm(env.DEV_SHOWDOWN_API_KEY, interactionId);
				const result = await generateObject({
					model: workshopLlm.chatModel('deli-4'),
					schema: z.object({
						name: z.string().describe('The full product name as mentioned in the description'),
						price: z.number(),
						currency: z.string(),
						inStock: z.boolean(),
						dimensions: z.object({
							length: z.number(),
							width: z.number(),
							height: z.number(),
							unit: z.string(),
						}),
						manufacturer: z.object({
							name: z.string(),
							country: z.string(),
							website: z.string(),
						}),
						specifications: z.object({
							weight: z.number(),
							weightUnit: z.string(),
							warrantyMonths: z.number(),
						}),
					}),
					prompt: payload.description,
				});

				return Response.json(result.object);
			}
			case 'BASIC_TOOL_CALL': {
				if (!env.DEV_SHOWDOWN_API_KEY) {
					throw new Error('DEV_SHOWDOWN_API_KEY is required');
				}

				const workshopLlm = createWorkshopLlm(env.DEV_SHOWDOWN_API_KEY, interactionId);

				const { object: { city } } = await generateObject({
					model: workshopLlm.chatModel('deli-4'),
					schema: z.object({ city: z.string().describe('The city name mentioned in the question') }),
					prompt: payload.question,
				});

				const weatherResponse = await fetch('https://devshowdown.com/api/weather', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						[INTERACTION_ID_HEADER]: interactionId,
					},
					body: JSON.stringify({ city }),
				});
				const weatherData = await weatherResponse.json<any>();

				const { text } = await generateText({
					model: workshopLlm.chatModel('deli-4'),
					system: 'You are a helpful weather assistant. Answer concisely and include the temperature.',
					prompt: `Question: ${payload.question}\nWeather data: ${JSON.stringify(weatherData)}`,
				});

				return Response.json({ answer: text });
			}
			default:
					return new Response('Solver not found', { status: 404 });
			}
	},
	} satisfies ExportedHandler<Env>;

function createWorkshopLlm(apiKey: string, interactionId: string) {
	return createOpenAICompatible({
		name: 'dev-showdown',
		baseURL: 'https://devshowdown.com/v1',
		supportsStructuredOutputs: true,
		headers: {
			Authorization: `Bearer ${apiKey}`,
			[INTERACTION_ID_HEADER]: interactionId,
		},
	});
}
