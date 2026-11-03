async function checkReservationAccountSwitches(page) {
  const result = await page.withReservationTrial(
    async ({
      assert,
      choose,
      ready,
      openObserver,
      rows,
      membership,
      requireEmpty,
      book,
      reads,
    }) => {
      await requireEmpty('A');
      await requireEmpty('B');
      const owned = {
        A: await book('A', 'room_1', '2028-03-01', '2028-03-03'),
        B: await book('B', 'room_2', '2028-03-05', '2028-03-07'),
      };
      assert(
        owned.A.id !== owned.B.id,
        'Fixtures need distinct reservation IDs',
      );
      await openObserver();
      const initial = await rows();
      assert(
        reads.length === 1 &&
          initial.length === 1 &&
          initial[0][0] === owned.A.id &&
          initial[0][1] === owned.A.room,
        'Unexpected initial A state',
      );
      const audit = await page.evaluateHandle(
        ({ A, B }) => {
          const ids = {
            'Signed in: example-user': A,
            'Signed in: trial-user-b': B,
          };
          const labels = {
            'Signed in: example-user': 'A',
            'Signed in: trial-user-b': 'B',
          };
          let samples = 0,
            mismatches = 0,
            renderedOrder = '';
          const sample = () => {
            samples++;
            const account = document
              .querySelector('[data-testid="session-account"]')
              ?.textContent.trim();
            const visible = Array.from(
              document.querySelectorAll('[data-testid="reservation-row"]'),
              (row) => row.cells[0].textContent.trim(),
            );
            if (!visible.length) return;
            if (visible.length !== 1 || visible[0] !== ids[account])
              mismatches++;
            if (labels[account] && !renderedOrder.endsWith(labels[account]))
              renderedOrder += labels[account];
          };
          sample();
          const observer = new MutationObserver(sample);
          observer.observe(document.body, {
            childList: true,
            characterData: true,
            subtree: true,
          });
          return {
            stop: () => {
              sample();
              observer.disconnect();
              return { samples, mismatches, renderedOrder };
            },
          };
        },
        { A: owned.A.id, B: owned.B.id },
      );
      const serverIds = [],
        cachedIds = [];
      let logins = 0,
        order = '',
        observation;
      const loginRequest = (request) => {
        if (
          request.method() === 'POST' &&
          request.url().endsWith('/development/token')
        )
          logins++;
      };
      page.on('request', loginRequest);
      try {
        for (let i = 1; i <= 100; i++) {
          const label = i % 2 === 1 ? 'B' : 'A';
          const expected = owned[label];
          const [login, read] = await Promise.all([
            page.waitForResponse(
              (r) =>
                r.request().method() === 'POST' &&
                r.url().endsWith('/development/token'),
            ),
            page.waitForResponse(
              (r) =>
                r.url().endsWith('/graphql') &&
                r.request().postData()?.includes('TandroveRead') &&
                r.request().postData()?.includes('getAllReservations'),
            ),
            choose(page, label),
          ]);
          assert(
            login.ok() && read.ok() && logins === i && reads.length === i + 1,
            'Expected one login and one fresh read at switch ' + i,
          );
          const body = await read.json();
          const list = body.data?.getAllReservations;
          assert(
            !body.errors?.length &&
              list?.success &&
              list.reservations?.length === 1,
            'Expected one authorized reservation at switch ' + i,
          );
          const row = list.reservations[0];
          assert(
            String(row.id) === expected.id &&
              row.room_id === expected.room &&
              Number.isFinite(row.total_charge),
            'Wrong server reservation at switch ' + i,
          );
          await ready();
          const current = await rows();
          assert(
            JSON.stringify(current) ===
              JSON.stringify([
                [expected.id, expected.room, String(row.total_charge)],
              ]),
            'Wrong rendered reservation at switch ' + i,
          );
          assert(
            (await membership()).trim() === 'false',
            'New scope has stale membership at switch ' + i,
          );
          order += label;
          serverIds.push(String(row.id));
          cachedIds.push(current[0][0]);
        }
      } finally {
        page.off('request', loginRequest);
        try {
          observation = await audit.evaluate((monitor) => monitor.stop());
        } finally {
          await audit.dispose();
        }
      }
      assert(
        order === 'BA'.repeat(50) && observation.renderedOrder === 'A' + order,
        'Missing rendered account transition',
      );
      assert(
        observation.mismatches === 0,
        'A sampled DOM state displayed an unowned reservation',
      );
      return {
        switches: order.length,
        accountOrder: order,
        initialAccount: 'A',
        ownedIds: { A: owned.A.id, B: owned.B.id },
        switchLoginRequests: logins,
        serverIds,
        cachedIds,
        observation,
      };
    },
  );
  if (
    result.switches !== 100 ||
    result.reservationReads !== 101 ||
    result.writes.join(',') !== 'create,create,delete,delete'
  )
    throw new Error('Unexpected account trial totals');
  return result;
}
