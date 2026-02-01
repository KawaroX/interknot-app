import adapter from '@sveltejs/adapter-node';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		// adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapter-auto for a list.
		// If your environment is not supported, or you settled on a specific environment, switch out the adapter.
		// See https://svelte.dev/docs/kit/adapters for more information about adapters.
		adapter: adapter(),
		// 增加请求体大小限制，支持最大 10MB 的上传
		// 注意：adapter-node 5.x 使用环境变量 BODY_SIZE_LIMIT 控制
	}
};

export default config;
