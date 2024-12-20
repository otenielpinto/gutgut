import { TMongo } from "../infra/mongoClient.js";
import { lib } from "../utils/lib.js";

const tmp_service = "tmp_service";

async function getServiceById(id_tenant, name_service) {
  const client = await TMongo.connect();
  let response = await client
    .collection(tmp_service)
    .findOne({ id: id_tenant, name: name_service });
  return response;
}

async function getService(id_tenant, name_service) {
  let response = await getServiceById(id_tenant, name_service);
  if (!response) {
    response = await updateService(id_tenant, name_service);
  }
  return response;
}

async function updateService(id_tenant, name_service) {
  let last = new Date();
  let dateBr = lib.formatDateBr(new Date());

  const client = await TMongo.connect();
  const service = await getServiceById(id_tenant, name_service);

  if (!service) {
    last = null;
    dateBr = null;
  }

  let config = {
    id: id_tenant,
    name: name_service,
    last: last,
    dateBr: dateBr,
  };

  return client
    .collection(tmp_service)
    .updateOne(
      { id: { $eq: id_tenant }, name: { $eq: name_service } },
      { $set: config },
      { upsert: true }
    );
}

async function hasExec(id_tenant, name_service) {
  let service = await getService(id_tenant, name_service);

  if (service.dateBr) {
    let dateBr = lib.formatDateBr(new Date());
    if (service.dateBr == dateBr) {
      return 1;
    }
  }
  return 0;
}

async function started(id_tenant, name_service) {
  if ((await hasExec(id_tenant, name_service)) == 1) {
    console.log('Servico já executado no dia "' + name_service + '"');
    return 1;
  }

  await updateService(id_tenant, name_service);
  return 0;
}

//criar classe para essa tarefa , refatorar
async function monthlyTaskExecuted(id_tenant, name_service) {
  let service = await getServiceById(id_tenant, name_service);
  if (!service) return 0; // Not executed this month

  if (service?.monthly_executed) {
    let lastExecutionDate = new Date(service.monthly_executed);
    let currentMonth = new Date().getMonth();
    let lastExecutionMonth = lastExecutionDate.getMonth();

    if (currentMonth !== lastExecutionMonth) {
      return 0; // Not executed this month
    }
  }
  return 1; // Executed this month
}

async function markMonthlyTaskExecuted(id_tenant, name_service) {
  const client = await TMongo.connect();

  let config = {
    id: Number(id_tenant),
    name: name_service,
    monthly_executed: new Date(),
  };

  return client
    .collection(tmp_service)
    .updateOne(
      { id: { $eq: id_tenant }, name: { $eq: name_service } },
      { $set: config },
      { upsert: true }
    );

  return 0;
}

const systemService = {
  started,
  getService,
  updateService,
  hasExec,

  monthlyTaskExecuted,
  markMonthlyTaskExecuted,
};

export { systemService };
