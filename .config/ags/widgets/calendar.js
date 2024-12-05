export default (monitor = 0) =>
  new Widget.Window({
    monitor,
    name: "calendar",
    visible: false,
    anchor: ["right"],
    margins: [0, 2, 0, 0],
    child: Widget.Box({
      vertical: true,
      children: [
        Widget.Button({
          onPrimaryClick: (b) => {
            const a = b.parent.children[1];
            a.select_month(
              Utils.exec('date "+%m"') - 1,
              Utils.exec('date "+%Y"'),
            );
            a.select_day(Utils.exec('date "+%d"'));
          },
          child: Widget.Label().poll(
            10000,
            (label) => (label.label = Utils.exec('date "+%A, %d of %B %Y."')),
          ),
        }),
        Widget.Calendar({
          showWeekNumbers: true,
          // onDaySelected: ({ date: [y, m, d] }) => {
          //   print(y)
          //   print(m+1)
          //   print(d)
          //   Utils.fetch(
          //     `https://openholidaysapi.org/PublicHolidays?countryIsoCode=PL&validFrom=${y}-${m + 1}-${d}&validTo=${y}-${m + 1}-${d}&languageIsoCode=EN`,
          //   )
          //     .then((res) => res.json())
          //     .then((a) => {
          //       if (a.length) {
          //         print(a[0]["name"][0]["text"]);
          //       }
          //     })
          //     .catch(console.error);
          // },
        }),
      ],
    }),
  });
