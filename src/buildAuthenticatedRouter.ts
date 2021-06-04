import AdminBro, { CurrentAdmin, Router } from 'admin-bro';
import { FastifyPluginCallback, FastifyPluginOptions } from 'fastify';
import fastifyCookie from 'fastify-cookie';
import fastifyFormbody from 'fastify-formbody';
import fastifySession from 'fastify-session';
import { promisify } from 'util';

import { plugin as routesPlugin, RouterOptions } from './buildRouter';

type NullableCurrentAdmin = CurrentAdmin | null;

type Options = {
  authenticate: (email: string, password: string) => NullableCurrentAdmin | Promise<NullableCurrentAdmin>;
  sessionOpts: fastifySession.Options;
} & RouterOptions | FastifyPluginOptions;

const getNormalizedPath = (rootPath: string, path: string): string => {
  // since we are inside already prefixed router we have to replace login and logout routes that
  // they don't have rootUrl inside. So changing /admin/login to just /login.
  // but there is a case where user gives / as a root url and /login becomes `login`. We have to
  // fix it by adding / in front of the route
  const normalizedLoginPath = path.replace(rootPath, '');

  return normalizedLoginPath.startsWith('/')
    ? normalizedLoginPath
    : `/${normalizedLoginPath}`;
};

const plugin = (admin: AdminBro): FastifyPluginCallback<Options> => async (fastify, opts) => {
  fastify.register(fastifyCookie); // needed for fastifySession
  fastify.register(fastifySession, { ...opts.sessionOpts });

  // login endpoint is using www-urlencoded, so we need to add parser for that
  fastify.register(fastifyFormbody);

  const { rootPath, loginPath, logoutPath } = admin.options;

  fastify.addHook('onRequest', (request, reply, done) => {
    console.log('session', request.session);
    if (Router.assets.find((asset) => request.url.match(asset.path))) {
      done();
    } else if (
      request.session.adminUser
      // these routes doesn't need authentication
      || request.url.startsWith(loginPath)
      || request.url.startsWith(logoutPath)
    ) {
      done();
    } else {
      // If the redirection is caused by API call to some action just redirect to resource
      const [redirectTo] = request.url.split('/actions');
      request.session.redirectTo = redirectTo.includes(`${rootPath}/api`)
        ? rootPath
        : redirectTo;
      reply.redirect(admin.options.loginPath);
    }
  });

  const loginPathNormalized = getNormalizedPath(rootPath, loginPath);

  fastify.get(loginPathNormalized, async (_request, reply) => {
    const login = await admin.renderLogin({
      action: admin.options.loginPath,
      errorMessage: null,
    });
    reply.type('text/html');
    reply.send(login);
  });

  fastify.post(loginPathNormalized, async (request, reply) => {
    const { email, password } = request.body as {
      email: string;
      password: string;
    };
    // Using promise resolve because authenticate can be promise but don't have to be
    const adminUser = await Promise.resolve(opts.authenticate(email, password));
    if (adminUser) {
      request.session.adminUser = adminUser;
      console.log(request.session);
      if (request.session.redirectTo) {
        reply.redirect(302, request.session.redirectTo);
      } else {
        reply.redirect(302, rootPath);
      }
    } else {
      const login = await admin.renderLogin({
        action: admin.options.loginPath,
        errorMessage: 'invalidCredentials',
      });
      reply.send(login);
    }
  });

  const logoutPathNormalized = getNormalizedPath(rootPath, logoutPath);

  fastify.get(logoutPathNormalized, async (request, reply) => {
    const asyncDestroySession = promisify(request.destroySession);
    await asyncDestroySession();
    reply.redirect(loginPath);
  });

  fastify.register(routesPlugin(admin), {
    ...opts,
    prefix: undefined,
  });
};

// eslint-disable-next-line import/prefer-default-export
export const buildAuthenticatedRouter = (
  admin: AdminBro,
): FastifyPluginCallback<Options> => async (fastify, opts) => {
  fastify.register(plugin(admin), {
    ...opts,
    prefix: admin.options.rootPath,
  });
};
