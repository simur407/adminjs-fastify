/* eslint-disable import/no-extraneous-dependencies */
import AdminBro from 'admin-bro';
import mongoose from 'mongoose';
import MongooseAdapter from '@admin-bro/mongoose';
import fastify from 'fastify';

import AdminBroFastify from '../src';
import './mongoose/article-model';
import './mongoose/admin-model';

AdminBro.registerAdapter(MongooseAdapter);

const start = async () => {
  const connection = await mongoose.connect(
    process.env.MONGO_URL || 'mongodb://localhost:27017/example',
    { useNewUrlParser: true, useUnifiedTopology: true },
  );
  const app = fastify({ logger: true });

  const adminBro = new AdminBro({
    databases: [connection],
    rootPath: '/admin',
  });
  const plugin = AdminBroFastify.buildAuthenticatedRouter(adminBro);

  app.register(plugin, {
    sessionOpts: {
      secret: 'superSecretSecretWithTotalOf32charsOrEvenMore',
      saveUninitialized: false,
      cookie: {
        secure: false, // for http test, https does not require this
        httpOnly: false,
      },
    },
    authenticate: (email, password) => {
      if (email === 'test@example.com') {
        return { email };
      }
      return undefined;
    },
  });

  await app.listen(process.env.PORT || 8080);
  app.log.info('AdminBro is under localhost:8080/admin');
};

start();
