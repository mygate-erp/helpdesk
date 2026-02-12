<template>
  <div>
    <LayoutHeader>
      <template #left-header>
        <ViewBreadcrumbs
          label="Tickets"
          :route-name="listRouteName"
          :options="dropdownOptions"
          :dropdown-actions="viewActions"
          :current-view="currentView"
        />
      </template>

      <template #right-header>
        <div class="flex items-center gap-2">
          <!-- Create -->
          <RouterLink :to="newTicketRoute">
            <Button label="Create" theme="gray" variant="solid">
              <template #prefix>
                <LucidePlus class="h-4 w-4" />
              </template>
            </Button>
          </RouterLink>

          <!-- Email (opens ERPNext desk Communication list) -->
          <Button
            label="Email"
            theme="gray"
            variant="subtle"
            @click="openErpEmail"
          >
            <template #prefix>
              <FeatherIcon name="mail" class="h-4 w-4" />
            </template>
          </Button>

          <!-- Bulk Email (redirects to /app/hd-ticket) -->
          <Button
            label="Bulk Action"
            theme="gray"
            variant="subtle"
            @click="openBulkEmail"
          >
            <template #prefix>
              <FeatherIcon name="send" class="h-4 w-4" />
            </template>
          </Button>
        </div>
      </template>
    </LayoutHeader>

    <ListViewBuilder
      ref="listViewRef"
      :options="options"
      @empty-state-action="handleEmptyStateAction"
      @row-click="handleRowClick"
    />

    <ExportModal
      v-model="showExportModal"
      :row-count="exportRowCount"
      @update="handleExportUpdate"
    />

    <ViewModal
      v-if="viewDialog.show"
      v-model="viewDialog"
      @update="handleViewUpdate"
    />
  </div>
</template>

<script setup lang="ts">
import { LayoutHeader, ListViewBuilder } from "@/components";
import {
  EditIcon,
  IndicatorIcon,
  PinIcon,
  TicketIcon,
  UnpinIcon,
} from "@/components/icons";
import ExportModal from "@/components/ticket/ExportModal.vue";
import ViewBreadcrumbs from "@/components/ViewBreadcrumbs.vue";
import ViewModal from "@/components/ViewModal.vue";
import { currentView, useView } from "@/composables/useView";
import { dayjs } from "@/dayjs";
import { useAuthStore } from "@/stores/auth";
import { globalStore } from "@/stores/globalStore";
import { useTicketStatusStore } from "@/stores/ticketStatus";
import type { View } from "@/types";
import { getIcon, isCustomerPortal } from "@/utils";
import { Badge, FeatherIcon, toast, Tooltip, usePageMeta } from "frappe-ui";
import { computed, h, onMounted, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";

const router = useRouter();
const route = useRoute();

const {
  getCurrentUserViews,
  createView,
  publicViews,
  pinnedViews,
  findView,
  updateView,
  deleteView,
} = useView("HD Ticket");

const { $dialog, $socket } = globalStore();
const { isManager } = useAuthStore();

const listViewRef = ref<any | null>(null);
const showExportModal = ref(false);

const { getStatus } = useTicketStatusStore();

/* ---------- Selection & banner actions ---------- */

const listSelections = ref<Set<string>>(new Set());

const selectBannerActions = [
  {
    label: "Export",
    icon: "download",
    onClick: (selections: Set<string>) => {
      listSelections.value = new Set(selections);
      showExportModal.value = true;
    },
  },
  {
    label: "Bulk Email",
    icon: "mail",
    onClick: (selections: Set<string>) => {
      // store selections if you ever want to use them
      listSelections.value = new Set(selections);
      openBulkEmail();
    },
  },
];

/* ---------- Column renderers & list options ---------- */

const slaStatusColorMap: Record<string, string> = {
  Fulfilled: "green",
  Failed: "red",
  "Resolution Due": "orange",
  "First Response Due": "orange",
  Paused: "blue",
};

const options = {
  doctype: "HD Ticket",
  columnConfig: {
    status: {
      custom: ({ item }: { item: any }) => {
        const status = getStatus(item);
        const label = isCustomerPortal.value
          ? status?.["label_customer"]
          : status?.["label_agent"];
        return h(
          "div",
          { class: "flex items-center space-x-2 justify-start w-full" },
          [
            h(IndicatorIcon, { class: status?.["parsed_color"] }),
            h("span", { class: "truncate flex-1" }, label),
          ]
        );
      },
    },
    agreement_status: {
      custom: ({ item }: { item: string }) => {
        return h(Badge, {
          label: item,
          theme: slaStatusColorMap[item],
          variant: "outline",
        });
      },
    },
    response_by: {
      custom: ({ row, item }: { row: any; item: string }) =>
        handle_response_by_field(row, item),
    },
    resolution_by: {
      custom: ({ row, item }: { row: any; item: string }) =>
        handle_resolution_by_field(row, item),
    },
  },
  isCustomerPortal: isCustomerPortal.value,
  selectable: true,
  showSelectBanner: true,
  selectBannerActions,
  emptyState: {
    title: "No Tickets Found",
    icon: h(TicketIcon, {
      class: "h-10 w-10",
    }),
  },
  rowRoute: {
    name: isCustomerPortal.value ? "TicketCustomer" : "TicketAgent",
    prop: "ticketId",
  },
  hideColumnSetting: false,
};

function handle_response_by_field(row: any, item: string) {
  if (!row.first_responded_on && dayjs(item).isBefore(new Date())) {
    return h(Badge, {
      label: "Failed",
      theme: "red",
      variant: "outline",
    });
  }
  if (row.first_responded_on && dayjs(row.first_responded_on).isBefore(item)) {
    return h(Badge, {
      label: "Fulfilled",
      theme: "green",
      variant: "outline",
    });
  } else if (dayjs(row.first_responded_on).isAfter(item)) {
    return h(Badge, {
      label: "Failed",
      theme: "red",
      variant: "outline",
    });
  } else {
    return h(
      Tooltip,
      {
        text: dayjs(item).long(),
      },
      () => dayjs.tz(item).fromNow()
    );
  }
}

function handle_resolution_by_field(row: any, item: string) {
  const status = getStatus(row.status) || {};
  if (status.category === "Paused") {
    return h(Badge, {
      label: "Paused",
      theme: "blue",
      variant: "outline",
    });
  } else if (row.resolution_date && dayjs(row.resolution_date).isBefore(item)) {
    return h(Badge, {
      label: "Fulfilled",
      theme: "green",
      variant: "outline",
    });
  } else if (dayjs(row.resolution_date).isAfter(item)) {
    return h(Badge, {
      label: "Failed",
      theme: "red",
      variant: "outline",
    });
  } else {
    return h(
      Tooltip,
      {
        text: dayjs(item).long(),
      },
      () => dayjs.tz(item).fromNow()
    );
  }
}

/* ---------- Export logic ---------- */

async function exportRows(
  export_type: "CSV" | "Excel" = "Excel",
  export_all: boolean = false
) {
  const list = listViewRef.value?.list;
  if (!list) return;

  const fields = JSON.stringify(list.data.columns.map((f: any) => f.key));
  const order_by = list.params.order_by;

  let filters: any = { ...list.params.filters };
  let pageLength: number;

  if (export_all) {
    filters = JSON.stringify(filters);
    pageLength = list.data.total_count;
  } else {
    pageLength = listSelections.value.size;
    filters["name"] = ["in", Array.from(listSelections.value)];
    filters = JSON.stringify(filters);
  }

  const url =
    "/api/method/frappe.desk.reportview.export_query" +
    `?file_format_type=${export_type}` +
    "&title=HD Ticket" +
    "&doctype=HD Ticket" +
    `&fields=${fields}` +
    `&filters=${filters}` +
    `&order_by=${order_by}` +
    `&page_length=${pageLength}` +
    "&start=0&view=Report&with_comment_count=1";

  window.location.href = url;
  reset();
  showExportModal.value = false;
}

function reset(reload = false) {
  if (listViewRef.value && listViewRef.value.unselectAll) {
    listViewRef.value.unselectAll();
  }
  if (listSelections.value && listSelections.value.clear) {
    listSelections.value.clear();
  }
  if (reload && listViewRef.value && listViewRef.value.reload) {
    listViewRef.value.reload();
  }
}

/* ---------- Views / dropdowns ---------- */

let viewDialog = reactive<{
  show: boolean;
  view: { label: string; icon: string; name: string };
  mode: "create" | "edit" | "duplicate";
}>({
  show: false,
  view: {
    label: "",
    icon: "",
    name: "",
  },
  mode: "create",
});

const dropdownOptions = computed(() => {
  const items: any[] = [
    {
      group: "Default Views",
      items: [
        {
          label: "List View",
          icon: "align-justify",
          onClick: () =>
            router.push({
              name: listRouteName.value,
            }),
        },
      ],
    },
  ];

  if (getCurrentUserViews.value && getCurrentUserViews.value.length) {
    items.push({
      group: "Saved Views",
      items: parseViews(getCurrentUserViews.value),
    });
  }
  if (pinnedViews.value && pinnedViews.value.length) {
    items.push({
      group: "Private Views",
      items: parseViews(pinnedViews.value),
    });
  }
  if (publicViews.value && publicViews.value.length) {
    items.push({
      group: "Public Views",
      items: parseViews(publicViews.value),
    });
  }

  items.push({
    group: "Create View",
    hideLabel: true,
    items: [
      {
        label: "Create View",
        icon: "plus",
        onClick: () => {
          resetState();
          viewDialog.show = true;
        },
      },
    ],
  });

  return items;
});

let selectedView: View | null = null;

const viewActions = (view: View) => {
  const _view = findView(view.name).value as View;

  const actions: any[] = [
    {
      group: "Default Views",
      hideLabel: true,
      items: [
        {
          label: "Duplicate",
          icon: h(FeatherIcon, { name: "copy" }),
          onClick: () => {
            viewDialog.view.label = _view.label + " (New)";
            viewDialog.view.icon = _view.icon;
            viewDialog.view.name = _view.name;
            viewDialog.mode = "duplicate";
            selectedView = _view;
            viewDialog.show = true;
          },
        },
      ],
    },
  ];

  if (!_view.public || isManager) {
    actions[0].items.push({
      label: "Edit",
      icon: h(EditIcon, { class: "h-4 w-4" }),
      onClick: () => {
        viewDialog.view.label = _view.label;
        viewDialog.view.icon = _view.icon;
        viewDialog.view.name = _view.name;
        viewDialog.mode = "edit";
        viewDialog.show = true;
      },
    });

    if (!_view.public) {
      actions[0].items.push({
        label: _view?.pinned ? "Unpin View" : "Pin View",
        icon: h(_view?.pinned ? UnpinIcon : PinIcon, { class: "h-4 w-4" }),
        onClick: () => {
          const newView: any = {
            name: _view.name,
            pinned: !_view.pinned,
          };
          updateView(newView);
        },
      });
    }

    if (isManager && !isCustomerPortal.value) {
      actions[0].items.push({
        label: _view?.public ? "Make Private" : "Make Public",
        icon: h(FeatherIcon, {
          name: _view?.public ? "lock" : "unlock",
          class: "h-4 w-4",
        }),
        onClick: () => {
          const newView: any = {
            name: _view.name,
            public: !_view.public,
          };

          if (_view.public) {
            $dialog({
              title: `Make ${_view.label} private?`,
              message:
                "This view is currently public. Changing it to private will hide it for all the users.",
              actions: [
                {
                  label: "Confirm",
                  variant: "solid",
                  onClick({ close }: { close: () => void }) {
                    close();
                    updateView(newView);
                  },
                },
              ],
            });
          } else {
            updateView(newView);
          }
        },
      });
    }

    actions.push({
      group: "Delete View",
      hideLabel: true,
      items: [
        {
          label: "Delete",
          icon: "trash-2",
          onClick: () => {
            $dialog({
              title: `Delete ${_view.label}?`,
              message:
                "Are you sure you want to delete this view?" +
                (_view.public
                  ? " This view is public, and will be removed for all users."
                  : ""),
              actions: [
                {
                  label: "Confirm",
                  variant: "solid",
                  onClick({ close }: { close: () => void }) {
                    if (route.query.view === _view.name) {
                      router.push({
                        name: listRouteName.value,
                      });
                    }
                    deleteView(_view.name);
                    handleSuccess("deleted");
                    close();
                  },
                },
              ],
            });
          },
        },
      ],
    });
  }

  return actions;
};

function parseViews(views: View[]) {
  return views.map((view) => ({
    ...view,
    onClick: () => {
      currentView.value = {
        label: view.label,
        icon: view.icon,
      };
      router.push({
        name: view.route_name,
        query: {
          view: view.name,
        },
      });
    },
  }));
}

function handleView(viewInfo: any, action: "update" | "duplicate" | "create") {
  let view: View;

  if (action === "update") {
    updateView(viewInfo);
    handleSuccess("updated");
    currentView.value = {
      label: viewInfo.label,
      icon: getIcon(viewInfo.icon),
    };
    return;
  } else if (action === "duplicate" && selectedView) {
    view = {
      ...selectedView,
      filters: JSON.stringify(selectedView.filters),
      columns: JSON.stringify(selectedView.columns),
      rows: JSON.stringify(selectedView.rows),
      label: viewInfo.label,
      icon: viewInfo.icon,
      public: false,
      pinned: false,
    };
  } else {
    view = {
      dt: "HD Ticket",
      type: "list",
      label: viewInfo.label || "List",
      icon: viewInfo.icon || "",
      route_name: router.currentRoute.value.name as string,
      order_by: listViewRef.value?.list?.params.order_by,
      filters: JSON.stringify(listViewRef.value?.list?.params.filters),
      columns: JSON.stringify(listViewRef.value?.list?.data.columns),
      rows: JSON.stringify(listViewRef.value?.list?.data?.rows),
      is_customer_portal: isCustomerPortal.value,
    } as View;
  }

  createView(view, (d: View) => {
    currentView.value = {
      label: d.label || "List",
      icon: getIcon(d.icon),
    };
    router.push({
      name: listRouteName.value,
      query: {
        view: d.name,
      },
    });

    handleSuccess();
  });
}

function handleSuccess(msg = "created") {
  toast.success(`View ${msg}`);
  resetState();
}

function resetState() {
  viewDialog.show = false;
  viewDialog.view.label = "";
  viewDialog.view.icon = "";
  viewDialog.view.name = "";
  viewDialog.mode = "create";
  selectedView = null;
}

/* ---------- Email / Bulk Email ---------- */

function openErpEmail() {
  // Opens ERPNext Desk Communication list
  window.location.href = "/app/communication";
}

function openBulkEmail() {
  // Always go to HD Ticket page
  // On your server this is: http://192.168.5.21/app/hd-ticket
  window.location.href = "/app/hd-ticket";
}

/* ---------- Template helpers ---------- */

const listRouteName = computed(() =>
  isCustomerPortal.value ? "TicketsCustomer" : "TicketsAgent"
);

const newTicketRoute = computed(() => ({
  name: isCustomerPortal.value ? "TicketNew" : "TicketAgentNew",
}));

const exportRowCount = computed(() => {
  const list = listViewRef.value?.list;
  if (!list || !list.data) return 0;
  return typeof list.data.total_count === "number"
    ? list.data.total_count
    : 0;
});

function handleEmptyStateAction() {
  router.push({
    name: isCustomerPortal.value ? "TicketNew" : "TicketAgentNew",
  });
}

function handleRowClick(row: string) {
  router.push({
    name: isCustomerPortal.value ? "TicketCustomer" : "TicketAgent",
    params: { ticketId: row },
  });
}

function handleExportUpdate(payload: {
  export_type: "CSV" | "Excel";
  export_all: boolean;
}) {
  exportRows(payload.export_type, payload.export_all);
}

function handleViewUpdate(
  view: any,
  action: "update" | "duplicate" | "create"
) {
  handleView(view, action);
}

/* ---------- Lifecycle & meta ---------- */

onMounted(() => {
  if (!route.query.view) {
    currentView.value = {
      label: "List",
      icon: "lucide:align-justify",
    };
  }
  $socket.on("helpdesk:new-ticket", () => {
    if (listViewRef.value && listViewRef.value.reload) {
      listViewRef.value.reload();
    }
  });
});

usePageMeta(() => ({
  title: "Tickets",
}));
</script>
