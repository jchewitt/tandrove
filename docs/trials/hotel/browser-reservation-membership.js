async function checkReservationMembership(page) {
  const result = await page.withReservationTrial(
    async ({
      assert,
      ready,
      openObserver,
      rows,
      membership,
      requireEmpty,
      book,
      cancel,
      reads,
    }) => {
      await requireEmpty('A');
      const anchor = await book('A', 'room_1', '2028-02-01', '2028-02-03');
      await openObserver();
      const baseline = await rows();
      assert(
        baseline.length === 1 &&
          baseline[0][0] === anchor.id &&
          baseline[0][1] === anchor.room,
        'Incorrect initial membership',
      );
      const stages = [];
      const check = async (name, prior, ids, stale, narrow) => {
        const button = narrow
          ? 'Refresh reservation charges'
          : 'Refresh reservation list';
        const responsePromise = page.waitForResponse(
          (res) =>
            res.url().endsWith('/graphql') &&
            res.request().postData()?.includes('TandroveRead') &&
            res.request().postData()?.includes('getAllReservations'),
        );
        const [response] = await Promise.all([
          responsePromise,
          page.getByRole('button', { name: button, exact: true }).click(),
        ]);
        const expectedStatus = prior === 3 ? 'Unavailable' : 'Ready';
        await page
          .getByTestId('reservation-state')
          .filter({ hasText: new RegExp('^' + expectedStatus + '$') })
          .waitFor();
        const body = await response.json();
        assert(
          response.ok() &&
            !body.errors?.length &&
            body.data.getAllReservations.success === true,
          'Real read failed',
        );
        assert(reads.length === prior + 1, name + ': unexpected read count');
        const query = reads[prior];
        for (const field of ['id', 'total_charge', 'success', 'errors'])
          assert(
            new RegExp('\\b' + field + '\\b').test(query),
            'Missing ' + field,
          );
        assert(
          /\broom_id\b/.test(query) === !narrow &&
            !/\b(checkin_date|checkout_date)\b/.test(query),
          'Unexpected field selection',
        );
        const current = await rows();
        assert(
          JSON.stringify(current.map((row) => row[0])) === JSON.stringify(ids),
          name + ': wrong cached members/order',
        );
        assert(
          JSON.stringify(current[0]) === JSON.stringify(baseline[0]),
          name + ': surviving row changed',
        );
        assert(
          (await membership()).trim() === String(stale),
          name + ': wrong mismatch indicator',
        );
        const serverRows = body.data.getAllReservations.reservations;
        const serverIds = serverRows.map((row) => String(row.id));
        assert(
          serverRows.every((row) => Number.isFinite(row.total_charge)),
          'Invalid authoritative charge',
        );
        if (!narrow) {
          const expectedRows = serverRows.map((row) => [
            String(row.id),
            row.room_id,
            String(row.total_charge),
          ]);
          assert(
            JSON.stringify(current) === JSON.stringify(expectedRows),
            'Displayed list differs from the server',
          );
        }
        if (expectedStatus === 'Unavailable')
          await page
            .getByRole('alert')
            .filter({ hasText: 'known records were missing' })
            .waitFor();
        stages.push({
          name,
          serverIds,
          cachedIds: current.map((row) => row[0]),
          membershipStale: (await membership()).trim() === 'true',
          status: expectedStatus,
          query,
        });
        return current;
      };
      assert(
        reads.length === 1 && (await membership()).trim() === 'false',
        'Unexpected initial read/state',
      );
      const target = await book('A', 'room_2', '2028-02-05', '2028-02-07');
      const initial = [anchor.id],
        both = [anchor.id, target.id];
      await check('charge refresh after booking', 1, initial, true, true);
      const adopted = await check(
        'list refresh after booking',
        2,
        both,
        false,
        false,
      );
      assert(
        adopted[1][1] === target.room && adopted[1][2] !== '',
        'Incomplete new reservation',
      );
      await cancel(target);
      const retained = await check(
        'charge refresh after cancellation',
        3,
        both,
        true,
        true,
      );
      assert(
        JSON.stringify(retained) === JSON.stringify(adopted),
        'Narrow refresh erased the cancelled cached row',
      );
      await check('list refresh after cancellation', 4, initial, false, false);
      assert(
        stages.every(
          (stage, i) =>
            JSON.stringify(stage.serverIds) ===
            JSON.stringify(i < 2 ? both : initial),
        ),
        'Authoritative response membership differed',
      );
      return { baselineId: anchor.id, targetId: target.id, stages };
    },
  );
  if (
    result.reservationReads !== 5 ||
    result.writes.join(',') !== 'create,create,delete,delete'
  )
    throw new Error('Unexpected trial request totals');
  return result;
}
