import AdminBro, { Router } from 'admin-bro';
import { FastifyPluginCallback, FastifyPluginOptions, HTTPMethods, RouteHandlerMethod } from 'fastify';
import fastifyMultipart, { FastifyMultipartOptions } from 'fastify-multipart';
import fastifyStatic from 'fastify-static';

import { WrongArgumentError } from './errors';

const INVALID_ADMIN_BRO_INSTANCE = 'You have to pass an instance of AdminBro to the buildRouter() function';

type Options = {
  fastifyMultipartOpts: Record<string, FastifyMultipartOptions>;
} | FastifyPluginOptions;

const plugin = (admin: AdminBro): FastifyPluginCallback<Options> => (fastify, opts, done) => {
  if (admin?.constructor?.name !== 'AdminBro') {
    throw new WrongArgumentError(INVALID_ADMIN_BRO_INSTANCE);
  }

  fastify.register(fastifyStatic, {
    root: __dirname,
    allowedPath: (pathName, root) => {
      fastify.log.debug('allowedPath', pathName, root);
      return true;
    },
  });

  fastify.register(fastifyMultipart, opts.fastifyMultipartOpts);

  admin.initialize().then(() => {
    fastify.log.debug('AdminBro: bundle ready');
  });

  const { routes, assets } = Router;

  assets.forEach((asset) => {
    const pathSplit = asset.src.split('/');
    const filename = pathSplit[pathSplit.length - 1]; // last item will be filename
    const rootPath = asset.src.slice(0, asset.src.lastIndexOf('/'));

    fastify.get(asset.path, (_request, reply) => {
      reply.sendFile(filename, rootPath);
    });
  });

  routes.forEach((route) => {
    let { path } = route;

    // we have to have slash at the beginning of every route. AdminBro index route has empty path.
    if (path === '') {
      path = '/';
    }

    // we have to change routes defined in AdminBro from {recordId} to :recordId
    const fastifyPath = path.replace(/{/g, ':').replace(/}/g, '');

    const handler: RouteHandlerMethod = async (request, reply) => {
      const controller = new route.Controller(
        { admin },
        // request.session && request.session.adminUser,
      );
      const { params, query } = request;
      const method = request.method.toLowerCase();
      console.log(request.body);
      const payload = {
        ...request.body as any,
      };
      const adminResponse = await controller[route.action](
        {
          ...request,
          params,
          query,
          payload,
          method,
        },
        reply,
      );

      if (route.contentType) {
        reply.type(route.contentType);
        // Detecting if controller is the frontend one
      } else if (route.Controller?.name === 'AppController') {
        reply.type('text/html');
      } else {
        // bold statement that it defaults to json but it should be admin responsibility to give proper content types
        reply.type('application/json');
      }

      if (adminResponse) {
        reply.send(adminResponse);
      }
    };

    fastify.route({
      url: fastifyPath,
      method: route.method as HTTPMethods,
      handler,
    });
  });

  done();
};

// eslint-disable-next-line import/prefer-default-export
export const buildRouter = (admin: AdminBro): FastifyPluginCallback<Options> => (fastify, opts, done) => {
  fastify.register(plugin(admin), {
    ...opts,
    prefix: admin.options.rootPath,
  });
  done();
};
