import { Component, OnInit, ViewChild, Input, OnDestroy } from '@angular/core';
import {
	IEmployee,
	IOrganizationContact,
	IOrganizationContactCreateInput,
	IOrganizationProject,
	ComponentLayoutStyleEnum,
	IOrganization,
	IContact,
	ICountry
} from '@gauzy/models';
import {
	ActivatedRoute,
	Router,
	RouterEvent,
	NavigationEnd
} from '@angular/router';
import { NbToastrService, NbDialogService } from '@nebular/theme';
import { TranslateService } from '@ngx-translate/core';
import { debounceTime, filter, first, tap } from 'rxjs/operators';
import { InviteContactComponent } from './invite-contact/invite-contact.component';
import { TranslationBaseComponent } from '../../@shared/language-base/translation-base.component';
import { EmployeesService } from '../../@core/services';
import { OrganizationProjectsService } from '../../@core/services/organization-projects.service';
import { OrganizationContactService } from '../../@core/services/organization-contact.service';
import { Store } from '../../@core/services/store.service';
import { ComponentEnum } from '../../@core/constants/layout.constants';
import { DeleteConfirmationComponent } from '../../@shared/user/forms/delete-confirmation/delete-confirmation.component';
import { LocalDataSource, Ng2SmartTableComponent } from 'ng2-smart-table';
import { EmployeeWithLinksComponent } from '../../@shared/table-components/employee-with-links/employee-with-links.component';
import { TaskTeamsComponent } from '../../@shared/table-components/task-teams/task-teams.component';
import { PictureNameTagsComponent } from '../../@shared/table-components/picture-name-tags/picture-name-tags.component';
import { ContactActionComponent } from './table-components/contact-action/contact-action.component';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { CountryService } from '../../@core/services/country.service';
@UntilDestroy({ checkProperties: true })
@Component({
	selector: 'ga-contact',
	templateUrl: './contact.component.html',
	styleUrls: ['./contact.component.scss']
})
export class ContactComponent
	extends TranslationBaseComponent
	implements OnInit, OnDestroy {
	organizationId: string;
	selectedOrganization: IOrganization;
	showAddCard: boolean;
	organizationContact: IOrganizationContact[] = [];
	projectsWithoutOrganizationContact: IOrganizationProject[];
	selectProjects: string[] = [];
	employees: IEmployee[] = [];
	organizationContactToEdit: IOrganizationContact;
	viewComponentName: ComponentEnum;
	dataLayoutStyle = ComponentLayoutStyleEnum.CARDS_GRID;
	settingsSmartTable: object;
	selectedContact: any;
	isGridEdit: boolean;
	disableButton = true;
	countries: ICountry[] = [];
	loading: boolean;

	smartTableSource = new LocalDataSource();
	@Input() contactType: any;

	contactsTable: Ng2SmartTableComponent;
	@ViewChild('contactsTable') set content(content: Ng2SmartTableComponent) {
		if (content) {
			this.contactsTable = content;
			this.onChangedSource();
		}
	}

	constructor(
		private readonly organizationContactService: OrganizationContactService,
		private readonly organizationProjectsService: OrganizationProjectsService,
		private readonly toastrService: NbToastrService,
		private readonly store: Store,
		private readonly employeesService: EmployeesService,
		readonly translateService: TranslateService,
		private dialogService: NbDialogService,
		private route: ActivatedRoute,
		private router: Router,
		private readonly countryService: CountryService
	) {
		super(translateService);
		this.setView();
		this.countryService.find$.next(true);
	}

	ngOnInit(): void {
		this.store.selectedOrganization$
			.pipe(
				filter((organization) => !!organization),
				untilDestroyed(this)
			)
			.subscribe((organization) => {
				if (organization) {
					this.selectedOrganization = organization;
					this.organizationId = organization.id;
					this.loadOrganizationContacts();
					this.loadProjectsWithoutOrganizationContacts();
					this.loadEmployees();
				}
			});
		this.route.queryParamMap
			.pipe(
				filter((params) => !!params),
				debounceTime(1000),
				untilDestroyed(this)
			)
			.subscribe((params) => {
				if (params.get('openAddDialog')) {
					this.add();
				}
			});
		this.router.events
			.pipe(untilDestroyed(this))
			.subscribe((event: RouterEvent) => {
				if (event instanceof NavigationEnd) {
					this.setView();
				}
			});
		this.countryService.countries$
			.pipe(
				tap((countries: ICountry[]) => (this.countries = countries)),
				tap(() => this.loadSmartTable()),
				untilDestroyed(this)
			)
			.subscribe();
		this._applyTranslationOnSmartTable();
	}

	ngOnDestroy(): void {}

	async loadSmartTable() {
		this.settingsSmartTable = {
			actions: false,
			columns: {
				contact_name: {
					title: this.getTranslation('ORGANIZATIONS_PAGE.NAME'),
					type: 'custom',
					class: 'align-row',
					renderComponent: PictureNameTagsComponent
				},
				members: {
					title: this.getTranslation(
						'ORGANIZATIONS_PAGE.EDIT.TEAMS_PAGE.MEMBERS'
					),
					type: 'custom',
					renderComponent: EmployeeWithLinksComponent,
					filter: false
				},
				primaryPhone: {
					title: this.getTranslation('CONTACTS_PAGE.PHONE'),
					type: 'string'
				},
				primaryEmail: {
					title: this.getTranslation('CONTACTS_PAGE.EMAIL'),
					type: 'string'
				},
				projects: {
					title: this.getTranslation('CONTACTS_PAGE.PROJECTS'),
					type: 'custom',
					renderComponent: TaskTeamsComponent,
					filter: false
				},
				country: {
					title: this.getTranslation('CONTACTS_PAGE.COUNTRY'),
					type: 'string',
					filter: false,
					valuePrepareFunction: (value, item) => {
						return this.getCountry(item);
					}
				},
				city: {
					title: this.getTranslation('CONTACTS_PAGE.CITY'),
					type: 'string'
				},
				street: {
					title: this.getTranslation('CONTACTS_PAGE.STREET'),
					type: 'string'
				},
				actions: {
					title: this.getTranslation(
						'APPROVAL_REQUEST_PAGE.APPROVAL_REQUEST_ACTIONS'
					),
					type: 'custom',
					renderComponent: ContactActionComponent,
					onComponentInitFunction: (instance) => {
						instance.updateResult.subscribe((params) => {
							this.invite(params);
						});
					},
					filter: false
				}
			},
			pager: {
				display: true,
				perPage: 8
			}
		};
	}
	selectContact({ isSelected, data }) {
		this.disableButton = !isSelected;
		this.selectedContact = isSelected ? data : null;
	}
	async removeOrganizationContact(id?: string, name?: string) {
		const result = await this.dialogService
			.open(DeleteConfirmationComponent, {
				context: {
					recordType: 'Contact'
				}
			})
			.onClose.pipe(first())
			.toPromise();

		if (result) {
			await this.organizationContactService.delete(
				this.selectedContact ? this.selectedContact.id : id
			);

			this.toastrService.primary(
				this.getTranslation(
					'NOTES.ORGANIZATIONS.EDIT_ORGANIZATIONS_CONTACTS.REMOVE_CONTACT',
					{
						name: this.selectedContact
							? this.selectedContact.name
							: name
					}
				),
				this.getTranslation('TOASTR.TITLE.SUCCESS')
			);

			this.loadOrganizationContacts();
		}
	}
	setView() {
		this.viewComponentName = ComponentEnum.CONTACTS;
		this.store
			.componentLayout$(this.viewComponentName)
			.pipe(untilDestroyed(this))
			.subscribe((componentLayout) => {
				this.dataLayoutStyle = componentLayout;
				this.selectedContact =
					this.dataLayoutStyle === 'CARDS_GRID'
						? null
						: this.selectedContact;
			});
	}

	public async addOrEditOrganizationContact(
		organizationContact: IOrganizationContactCreateInput
	) {
		const contact: IContact = {
			country: organizationContact.country,
			city: organizationContact.city,
			address: organizationContact.address,
			address2: organizationContact.address2,
			postcode: organizationContact.postcode,
			fax: organizationContact.fax,
			fiscalInformation: organizationContact.fiscalInformation,
			website: organizationContact.website,
			latitude: organizationContact.latitude,
			longitude: organizationContact.longitude
		};
		const organizationContactData = {
			...organizationContact,
			contact
		};
		if (
			organizationContact.name &&
			organizationContact.primaryEmail &&
			organizationContact.primaryPhone
		) {
			await this.organizationContactService.create(
				organizationContactData
			);

			this.showAddCard = !this.showAddCard;
			this.selectProjects = [];

			this.toastrService.primary(
				this.getTranslation(
					'NOTES.ORGANIZATIONS.EDIT_ORGANIZATIONS_CONTACTS.ADD_CONTACT',
					{
						name: organizationContact.name
					}
				),
				this.getTranslation('TOASTR.TITLE.SUCCESS')
			);

			this.loadOrganizationContacts();
		} else {
			this.toastrService.danger(
				this.getTranslation(
					'NOTES.ORGANIZATIONS.EDIT_ORGANIZATIONS_CONTACTS.INVALID_CONTACT_DATA'
				),
				this.getTranslation(
					'TOASTR.MESSAGE.NEW_ORGANIZATION_CONTACT_INVALID_DATA'
				)
			);
		}
	}

	private async loadOrganizationContacts() {
		this.loading = true;
		if (!this.selectedOrganization) {
			return;
		}
		const { tenantId } = this.store.user;
		const { id: organizationId } = this.selectedOrganization;
		const res = await this.organizationContactService.getAll(
			['projects', 'members', 'members.user', 'tags', 'contact'],
			{ organizationId, tenantId, contactType: this.contactType }
		);

		if (res) {
			const result = [];
			res.items.forEach((contact: IOrganizationContact) => {
				result.push({
					...contact,
					contact_name: contact.name,
					country: contact.contact ? contact.contact.country : '',
					city: contact.contact ? contact.contact.city : '',
					street: contact.contact ? contact.contact.address : '',
					street2: contact.contact ? contact.contact.address2 : '',
					postcode: contact.contact ? contact.contact.postcode : null,
					fax: contact.contact ? contact.contact.fax : '',
					website: contact.contact ? contact.contact.website : '',
					fiscalInformation: contact.contact
						? contact.contact.fiscalInformation
						: ''
				});
			});
			this.organizationContact = result;
			this.smartTableSource.load(result);
			this.loading = false;
		}
	}

	private async loadProjectsWithoutOrganizationContacts() {
		this.loading = true;
		const { tenantId } = this.store.user;
		const { id: organizationId } = this.selectedOrganization;
		const res = await this.organizationProjectsService.getAll(
			['organizationContact'],
			{ organizationId, tenantId, organizationContact: null }
		);

		if (res) {
			this.projectsWithoutOrganizationContact = res.items;
		}
		this.loading = false;
	}

	private async loadEmployees() {
		this.loading = true;
		if (!this.selectedOrganization) {
			return;
		}
		const { tenantId } = this.store.user;
		const { id: organizationId } = this.selectedOrganization;
		const { items } = await this.employeesService
			.getAll(['user'], {
				organization: { id: organizationId, tenantId }
			})
			.pipe(first())
			.toPromise();
		this.employees = items;
		this.loading = false;
	}

	cancel() {
		this.organizationContactToEdit = null;
		this.showAddCard = !this.showAddCard;
	}

	async editOrganizationContact(organizationContact: IOrganizationContact) {
		await this.loadProjectsWithoutOrganizationContacts();
		this.organizationContactToEdit = organizationContact
			? organizationContact
			: this.selectedContact;
		this.isGridEdit = organizationContact ? false : true;
		this.showAddCard = true;
	}

	async add() {
		await this.loadProjectsWithoutOrganizationContacts();
		this.organizationContactToEdit = null;
		this.showAddCard = true;
	}

	async invite(selectedOrganizationContact?: IOrganizationContact) {
		try {
			const dialog = this.dialogService.open(InviteContactComponent, {
				context: {
					organizationId: this.selectedOrganization.id,
					organizationContact: selectedOrganizationContact,
					contactType: this.contactType,
					selectedOrganization: this.selectedOrganization
				}
			});

			const result = await dialog.onClose.pipe(first()).toPromise();

			if (result) {
				await this.loadOrganizationContacts();

				this.toastrService.primary(
					this.getTranslation(
						'NOTES.ORGANIZATIONS.EDIT_ORGANIZATIONS_CONTACTS.INVITE_CONTACT',
						{
							name: result.name
						}
					),
					this.getTranslation('TOASTR.TITLE.SUCCESS')
				);
			}
		} catch (error) {
			this.toastrService.danger(
				this.getTranslation(
					'NOTES.ORGANIZATIONS.EDIT_ORGANIZATIONS_CONTACTS.INVITE_CONTACT_ERROR'
				),
				this.getTranslation('TOASTR.TITLE.ERROR')
			);
		}
	}
	_applyTranslationOnSmartTable() {
		this.translateService.onLangChange
			.pipe(untilDestroyed(this))
			.subscribe(() => {
				this.loadSmartTable();
			});
	}

	/*
	 * Table on changed source event
	 */
	onChangedSource() {
		this.contactsTable.source.onChangedSource
			.pipe(
				untilDestroyed(this),
				tap(() => this.clearItem())
			)
			.subscribe();
	}

	/*
	 * Clear selected item
	 */
	clearItem() {
		this.selectContact({
			isSelected: false,
			data: null
		});
		this.deselectAll();
	}
	/*
	 * Deselect all table rows
	 */
	deselectAll() {
		if (this.contactsTable && this.contactsTable.grid) {
			this.contactsTable.grid.dataSet['willSelect'] = 'false';
			this.contactsTable.grid.dataSet.deselectAll();
		}
	}

	getCountry(row) {
		const find: ICountry = this.countries.find(
			(item) => item.isoCode === row.country
		);
		return find ? find.country : row.country;
	}
}
